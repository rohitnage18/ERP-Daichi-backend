/**
 * Sales-order stock reservation (block available qty without depleting on-hand).
 * available = quantity - reservedQuantity
 */
import { Db, ObjectId } from "mongodb";
import { StockError, normalizeStockLines, type StockLine } from "./inventory-stock";

type InvRow = {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reservedQuantity?: number;
  reorderLevel?: number;
  warehouseCode: string;
  lastUpdated: Date;
};

function available(row: InvRow | null | undefined): number {
  if (!row) return 0;
  return Math.max(0, Number(row.quantity || 0) - Number(row.reservedQuantity || 0));
}

export async function reserveStockForOrder(
  db: Db,
  items: StockLine[],
  orderId: ObjectId,
  ctx: { userId?: string; userName?: string } = {}
): Promise<void> {
  const lines = normalizeStockLines(items);
  if (lines.length === 0) return;
  const col = db.collection<InvRow>("inventoryItems");
  const applied: { productId: ObjectId; quantity: number }[] = [];
  const now = new Date();

  try {
    for (const line of lines) {
      const row = await col.findOne({ productId: line.productId });
      if (available(row) < line.quantity) {
        const product = await db.collection("products").findOne({ _id: line.productId });
        const name = (product as { name?: string } | null)?.name || line.name || line.productId.toString();
        throw new StockError(
          `Only ${available(row)} Nos available for ${name} (cannot reserve for sales order)`
        );
      }
      const updated = await col.findOneAndUpdate(
        {
          productId: line.productId,
          $expr: {
            $gte: [
              { $subtract: ["$quantity", { $ifNull: ["$reservedQuantity", 0] }] },
              line.quantity,
            ],
          },
        },
        {
          $inc: { reservedQuantity: line.quantity },
          $set: { lastUpdated: now },
        },
        { returnDocument: "after" }
      );
      if (!updated) {
        throw new StockError(`Could not reserve stock for ${line.name || line.productId.toString()}`);
      }
      applied.push({ productId: line.productId, quantity: line.quantity });
    }
  } catch (err) {
    for (const line of applied.reverse()) {
      await col.updateOne(
        { productId: line.productId },
        { $inc: { reservedQuantity: -line.quantity }, $set: { lastUpdated: now } }
      );
      await col.updateOne(
        { productId: line.productId, reservedQuantity: { $lt: 0 } },
        { $set: { reservedQuantity: 0 } }
      );
    }
    throw err;
  }

  await db.collection("inventoryMovements").insertMany(
    applied.map((line) => ({
      productId: line.productId,
      quantity: 0,
      type: "ADJUSTMENT" as const,
      notes: `Reserved ${line.quantity} for order ${orderId.toString()}`,
      referenceId: orderId.toString(),
      userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
      userName: ctx.userName,
      createdAt: now,
    }))
  );
}

export async function releaseStockReservation(
  db: Db,
  items: StockLine[],
  orderId: ObjectId,
  ctx: { userId?: string; userName?: string } = {}
): Promise<void> {
  const lines = normalizeStockLines(items);
  if (lines.length === 0) return;
  const col = db.collection<InvRow>("inventoryItems");
  const now = new Date();
  for (const line of lines) {
    await col.updateOne(
      { productId: line.productId },
      { $inc: { reservedQuantity: -line.quantity }, $set: { lastUpdated: now } }
    );
    await col.updateOne(
      { productId: line.productId, reservedQuantity: { $lt: 0 } },
      { $set: { reservedQuantity: 0 } }
    );
  }
  await db.collection("inventoryMovements").insertMany(
    lines.map((line) => ({
      productId: line.productId,
      quantity: 0,
      type: "ADJUSTMENT" as const,
      notes: `Released reservation ${line.quantity} for order ${orderId.toString()}`,
      referenceId: orderId.toString(),
      userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
      userName: ctx.userName,
      createdAt: now,
    }))
  );
}

/** Transfer stock between warehouse codes (same product). Creates/updates destination row. */
export async function transferWarehouseStock(
  db: Db,
  opts: {
    productId: string;
    quantity: number;
    fromWarehouse: string;
    toWarehouse: string;
    userId?: string;
    userName?: string;
    remarks?: string;
  }
): Promise<{ fromQty: number; toQty: number }> {
  if (!ObjectId.isValid(opts.productId)) throw new StockError("Invalid product id");
  const qty = Math.abs(Number(opts.quantity) || 0);
  if (qty <= 0) throw new StockError("Transfer quantity must be positive");
  const from = opts.fromWarehouse.trim();
  const to = opts.toWarehouse.trim();
  if (!from || !to || from === to) throw new StockError("fromWarehouse and toWarehouse must differ");

  const pid = new ObjectId(opts.productId);
  const col = db.collection<InvRow>("inventoryItems");
  const now = new Date();

  let source = await col.findOne({ productId: pid, warehouseCode: from });
  if (!source) {
    // Fallback: single-warehouse deployments store one row per product
    source = await col.findOne({ productId: pid });
    if (source && source.warehouseCode !== from) {
      throw new StockError(`No stock found in warehouse ${from}`);
    }
  }
  if (!source || available(source) < qty) {
    throw new StockError(`Only ${available(source)} available to transfer from ${from}`);
  }

  await col.updateOne({ _id: source._id }, { $inc: { quantity: -qty }, $set: { lastUpdated: now } });

  const dest = await col.findOne({ productId: pid, warehouseCode: to });
  if (dest) {
    await col.updateOne({ _id: dest._id }, { $inc: { quantity: qty }, $set: { lastUpdated: now } });
  } else {
    await col.insertOne({
      productId: pid,
      quantity: qty,
      reservedQuantity: 0,
      reorderLevel: source.reorderLevel ?? 10,
      warehouseCode: to,
      lastUpdated: now,
    });
  }

  const product = await db.collection("products").findOne({ _id: pid });
  await db.collection("inventoryMovements").insertOne({
    productId: pid,
    sku: (product as { productCode?: string } | null)?.productCode,
    productName: (product as { name?: string } | null)?.name,
    quantity: 0,
    type: "ADJUSTMENT",
    warehouseCode: `${from}→${to}`,
    notes: opts.remarks || `Transfer ${qty} from ${from} to ${to}`,
    userId: opts.userId && ObjectId.isValid(opts.userId) ? new ObjectId(opts.userId) : undefined,
    userName: opts.userName,
    createdAt: now,
  });

  const fromAfter = await col.findOne({ _id: source._id });
  const toAfter = await col.findOne({ productId: pid, warehouseCode: to });
  return { fromQty: fromAfter?.quantity ?? 0, toQty: toAfter?.quantity ?? qty };
}
