import { Db, ObjectId } from "mongodb";

type InventoryItemDoc = {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reorderLevel: number;
  warehouseCode: string;
  lastUpdated: Date;
};

export type StockLine = { productId?: ObjectId | string | null; quantity?: number; name?: string };

export class StockError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

export function productObjectId(raw: StockLine["productId"]): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  if (typeof raw === "string" && ObjectId.isValid(raw)) return new ObjectId(raw);
  return null;
}

export function normalizeStockLines(items: StockLine[]): { productId: ObjectId; quantity: number; name?: string }[] {
  const merged = new Map<string, { productId: ObjectId; quantity: number; name?: string }>();
  for (const item of items || []) {
    const id = productObjectId(item?.productId);
    const qty = Math.abs(Number(item.quantity) || 0);
    if (!id || qty <= 0) continue;
    const key = id.toString();
    const prev = merged.get(key);
    if (prev) prev.quantity += qty;
    else merged.set(key, { productId: id, quantity: qty, name: item.name });
  }
  return [...merged.values()];
}

export function evaluateAvailability(
  lines: { productId: ObjectId; quantity: number; name?: string }[],
  stockByProduct: Map<string, { quantity: number; sku?: string; name?: string }>
): { ok: true } | { ok: false; message: string } {
  const shortages: string[] = [];
  for (const line of lines) {
    const key = line.productId.toString();
    const row = stockByProduct.get(key);
    const label = row?.sku || row?.name || line.name || key;
    if (!row) {
      shortages.push(`${label}: no inventory record`);
      continue;
    }
    if (row.quantity < line.quantity) {
      shortages.push(`${label}: need ${line.quantity}, have ${row.quantity}`);
    }
  }
  if (shortages.length === 0) return { ok: true };
  return { ok: false, message: `Insufficient stock. ${shortages.join("; ")}` };
}

async function writeLedger(
  db: Db,
  entries: {
    productId: ObjectId;
    sku?: string;
    productName?: string;
    quantity: number;
    type: "invoice_deduction" | "invoice_reversal" | "upload" | "manual_adjust" | "dispatch_deduction";
    invoiceId?: ObjectId;
    invoiceNumber?: string;
    uploadId?: ObjectId;
    warehouseCode?: string;
    userId?: ObjectId;
    userName?: string;
    notes?: string;
  }[]
) {
  if (entries.length === 0) return;
  const now = new Date();
  await db.collection("inventoryMovements").insertMany(
    entries.map((e) => ({
      ...e,
      createdAt: now,
    }))
  );
}

async function stockMap(db: Db, productIds: ObjectId[]) {
  const items = await db
    .collection<InventoryItemDoc>("inventoryItems")
    .find({ productId: { $in: productIds } })
    .toArray();
  const products = await db
    .collection("products")
    .find({ _id: { $in: productIds } })
    .project({ productCode: 1, name: 1 })
    .toArray();
  const productInfo = new Map(products.map((p) => [p._id!.toString(), p]));
  const map = new Map<string, { quantity: number; sku?: string; name?: string; warehouseCode?: string }>();
  for (const item of items) {
    const info = productInfo.get(item.productId.toString()) as { productCode?: string; name?: string } | undefined;
    map.set(item.productId.toString(), {
      quantity: item.quantity,
      sku: info?.productCode,
      name: info?.name,
      warehouseCode: item.warehouseCode,
    });
  }
  return map;
}

export type DeductContext = {
  invoiceId?: ObjectId;
  invoiceNumber?: string;
  userId?: string;
  userName?: string;
  type?: "invoice_deduction" | "dispatch_deduction";
};

/**
 * Atomically deduct stock for invoiced quantities. Throws StockError on shortage.
 * Rolls back earlier SKUs in this call if a later SKU fails.
 */
export async function applyInvoiceDeduction(
  db: Db,
  items: StockLine[],
  ctx: DeductContext = {}
): Promise<void> {
  const lines = normalizeStockLines(items);
  if (lines.length === 0) return;

  const availability = evaluateAvailability(lines, await stockMap(db, lines.map((l) => l.productId)));
  if (!availability.ok) throw new StockError(availability.message);

  const now = new Date();
  const col = db.collection<InventoryItemDoc>("inventoryItems");
  const deducted: { productId: ObjectId; quantity: number }[] = [];

  try {
    for (const line of lines) {
      const updated = await col.findOneAndUpdate(
        { productId: line.productId, quantity: { $gte: line.quantity } },
        { $inc: { quantity: -line.quantity }, $set: { lastUpdated: now } },
        { returnDocument: "after" }
      );
      if (!updated) {
        throw new StockError(`Insufficient stock for product ${line.name || line.productId.toString()}`);
      }
      deducted.push({ productId: line.productId, quantity: line.quantity });
    }
  } catch (error) {
    for (const line of deducted.reverse()) {
      await col.updateOne(
        { productId: line.productId },
        { $inc: { quantity: line.quantity }, $set: { lastUpdated: now } }
      );
    }
    throw error;
  }

  const info = await stockMap(db, lines.map((l) => l.productId));
  await writeLedger(
    db,
    lines.map((line) => {
      const row = info.get(line.productId.toString());
      return {
        productId: line.productId,
        sku: row?.sku,
        productName: row?.name || line.name,
        quantity: -line.quantity,
        type: ctx.type || "invoice_deduction",
        invoiceId: ctx.invoiceId,
        invoiceNumber: ctx.invoiceNumber,
        warehouseCode: row?.warehouseCode,
        userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
        userName: ctx.userName,
      };
    })
  );
}

export async function reverseInvoiceDeduction(
  db: Db,
  items: StockLine[],
  ctx: DeductContext = {}
): Promise<void> {
  const lines = normalizeStockLines(items);
  if (lines.length === 0) return;
  const now = new Date();
  const col = db.collection<InventoryItemDoc>("inventoryItems");
  for (const line of lines) {
    await col.updateOne(
      { productId: line.productId },
      { $inc: { quantity: line.quantity }, $set: { lastUpdated: now } },
      { upsert: false }
    );
  }
  const info = await stockMap(db, lines.map((l) => l.productId));
  await writeLedger(
    db,
    lines.map((line) => {
      const row = info.get(line.productId.toString());
      return {
        productId: line.productId,
        sku: row?.sku,
        productName: row?.name || line.name,
        quantity: line.quantity,
        type: "invoice_reversal" as const,
        invoiceId: ctx.invoiceId,
        invoiceNumber: ctx.invoiceNumber,
        warehouseCode: row?.warehouseCode,
        userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
        userName: ctx.userName,
        notes: "Invoice cancelled",
      };
    })
  );
}

/** @deprecated Use applyInvoiceDeduction. Kept for dispatch fallback. */
export async function deductInventory(db: Db, items: StockLine[]): Promise<void> {
  await applyInvoiceDeduction(db, items, { type: "dispatch_deduction" });
}
