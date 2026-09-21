import { Db, ObjectId, ClientSession } from "mongodb";
import { getMongoClient } from "./mongodb";
import { toBaseUnits, normalizeUnitsPerCase, type QtyUnit } from "./stock-math";

type InventoryItemDoc = {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reorderLevel: number;
  warehouseCode: string;
  lastUpdated: Date;
};

/** Canonical ledger types (legacy aliases still accepted when reading). */
export type StockMovementType =
  | "OPENING"
  | "INWARD"
  | "INVOICE"
  | "INVOICE_CANCEL"
  | "ADJUSTMENT"
  // Legacy (written by older builds; still readable)
  | "invoice_deduction"
  | "invoice_reversal"
  | "upload"
  | "manual_adjust"
  | "dispatch_deduction";

export type StockLine = {
  productId?: ObjectId | string | null;
  quantity?: number;
  name?: string;
  /** Optional: convert Case → base before deducting */
  unit?: QtyUnit | string;
  unitsPerCase?: number;
};

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

export function normalizeStockLines(
  items: StockLine[]
): { productId: ObjectId; quantity: number; name?: string }[] {
  const merged = new Map<string, { productId: ObjectId; quantity: number; name?: string }>();
  for (const item of items || []) {
    const id = productObjectId(item?.productId);
    if (!id) continue;
    const upc = normalizeUnitsPerCase(item.unitsPerCase, 1);
    const qty = item.unit
      ? toBaseUnits(Number(item.quantity) || 0, item.unit, upc)
      : Math.abs(Number(item.quantity) || 0);
    if (qty <= 0) continue;
    const key = id.toString();
    const prev = merged.get(key);
    if (prev) prev.quantity += qty;
    else merged.set(key, { productId: id, quantity: qty, name: item.name });
  }
  return [...merged.values()];
}

export function shortageMessage(productLabel: string, available: number, baseUnit = "Nos"): string {
  return `Only ${available} ${baseUnit} available for ${productLabel}`;
}

export function evaluateAvailability(
  lines: { productId: ObjectId; quantity: number; name?: string }[],
  stockByProduct: Map<string, { quantity: number; sku?: string; name?: string; baseUnit?: string }>
): { ok: true } | { ok: false; message: string } {
  const shortages: string[] = [];
  for (const line of lines) {
    const key = line.productId.toString();
    const row = stockByProduct.get(key);
    const label = row?.name || line.name || row?.sku || key;
    const unit = row?.baseUnit || "Nos";
    if (!row) {
      shortages.push(shortageMessage(label, 0, unit));
      continue;
    }
    if (row.quantity < line.quantity) {
      shortages.push(shortageMessage(label, row.quantity, unit));
    }
  }
  if (shortages.length === 0) return { ok: true };
  return { ok: false, message: shortages.join("; ") };
}

/** Diff old vs new invoice lines → net base-unit changes (positive = need more stock out). */
export function stockDiffLines(
  previous: StockLine[],
  next: StockLine[]
): { productId: ObjectId; quantity: number; name?: string }[] {
  const prev = normalizeStockLines(previous);
  const nxt = normalizeStockLines(next);
  const map = new Map<string, { productId: ObjectId; quantity: number; name?: string }>();
  for (const line of nxt) {
    map.set(line.productId.toString(), { ...line });
  }
  for (const line of prev) {
    const key = line.productId.toString();
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { productId: line.productId, quantity: -line.quantity, name: line.name });
    } else {
      cur.quantity -= line.quantity;
    }
  }
  return [...map.values()].filter((l) => l.quantity !== 0);
}

async function writeLedger(
  db: Db,
  entries: {
    productId: ObjectId;
    sku?: string;
    productName?: string;
    quantity: number;
    type: StockMovementType;
    invoiceId?: ObjectId;
    invoiceNumber?: string;
    uploadId?: ObjectId;
    warehouseCode?: string;
    userId?: ObjectId;
    userName?: string;
    notes?: string;
    referenceId?: string;
  }[],
  session?: ClientSession | null
) {
  if (entries.length === 0) return;
  const now = new Date();
  await db.collection("inventoryMovements").insertMany(
    entries.map((e) => ({
      ...e,
      createdAt: now,
    })),
    session ? { session } : undefined
  );
}

async function stockMap(db: Db, productIds: ObjectId[], session?: ClientSession | null) {
  const items = await db
    .collection<InventoryItemDoc>("inventoryItems")
    .find({ productId: { $in: productIds } }, session ? { session } : undefined)
    .toArray();
  const products = await db
    .collection("products")
    .find({ _id: { $in: productIds } }, session ? { session } : undefined)
    .project({ productCode: 1, name: 1, unitOfMeasure: 1, unitsPerAlternate: 1 })
    .toArray();
  const productInfo = new Map(products.map((p) => [p._id!.toString(), p]));
  const map = new Map<
    string,
    {
      quantity: number;
      physicalQuantity?: number;
      sku?: string;
      name?: string;
      warehouseCode?: string;
      baseUnit?: string;
    }
  >();
  for (const item of items) {
    const info = productInfo.get(item.productId.toString()) as
      | { productCode?: string; name?: string; unitOfMeasure?: string }
      | undefined;
    const uom = (info?.unitOfMeasure || "Nos").toLowerCase();
    const baseUnit = uom === "kg" ? "KG" : "Nos";
    map.set(item.productId.toString(), {
      quantity: Math.max(0, Number(item.quantity || 0) - Number((item as { reservedQuantity?: number }).reservedQuantity || 0)),
      physicalQuantity: item.quantity,
      sku: info?.productCode,
      name: info?.name,
      warehouseCode: item.warehouseCode,
      baseUnit,
    });
  }
  return map;
}

export type DeductContext = {
  invoiceId?: ObjectId;
  invoiceNumber?: string;
  userId?: string;
  userName?: string;
  /** Canonical type; defaults to INVOICE. Legacy dispatch_deduction still accepted. */
  type?: StockMovementType;
  notes?: string;
};

async function withOptionalTransaction<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
  const client = getMongoClient();
  if (!client) return fn(null);
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    // Standalone / free-tier clusters may not support transactions — fall back.
    const msg = err instanceof Error ? err.message : String(err);
    if (/transaction|replica set|not supported/i.test(msg)) {
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

/**
 * Atomically deduct stock for invoiced quantities. Throws StockError on shortage.
 * Uses a Mongo transaction when available; otherwise conditional updates + compensating rollback.
 */
export async function applyInvoiceDeduction(
  db: Db,
  items: StockLine[],
  ctx: DeductContext = {}
): Promise<void> {
  const lines = normalizeStockLines(items);
  if (lines.length === 0) return;
  const movementType: StockMovementType =
    ctx.type === "dispatch_deduction" ? "dispatch_deduction" : ctx.type || "INVOICE";

  await withOptionalTransaction(async (session) => {
    const availability = evaluateAvailability(lines, await stockMap(db, lines.map((l) => l.productId), session));
    if (!availability.ok) throw new StockError(availability.message);

    const now = new Date();
    const col = db.collection<InventoryItemDoc>("inventoryItems");
    const deducted: { productId: ObjectId; quantity: number }[] = [];

    try {
      for (const line of lines) {
        const updated = await col.findOneAndUpdate(
          { productId: line.productId, quantity: { $gte: line.quantity } },
          { $inc: { quantity: -line.quantity }, $set: { lastUpdated: now } },
          { returnDocument: "after", ...(session ? { session } : {}) }
        );
        if (!updated) {
          const info = await stockMap(db, [line.productId], session);
          const row = info.get(line.productId.toString());
          throw new StockError(
            shortageMessage(row?.name || line.name || line.productId.toString(), row?.quantity ?? 0, row?.baseUnit)
          );
        }
        deducted.push({ productId: line.productId, quantity: line.quantity });
      }
    } catch (error) {
      if (!session) {
        for (const line of deducted.reverse()) {
          await col.updateOne(
            { productId: line.productId },
            { $inc: { quantity: line.quantity }, $set: { lastUpdated: now } }
          );
        }
      }
      throw error;
    }

    const info = await stockMap(
      db,
      lines.map((l) => l.productId),
      session
    );
    await writeLedger(
      db,
      lines.map((line) => {
        const row = info.get(line.productId.toString());
        return {
          productId: line.productId,
          sku: row?.sku,
          productName: row?.name || line.name,
          quantity: -line.quantity,
          type: movementType,
          invoiceId: ctx.invoiceId,
          invoiceNumber: ctx.invoiceNumber,
          warehouseCode: row?.warehouseCode,
          userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
          userName: ctx.userName,
          notes: ctx.notes,
          referenceId: ctx.invoiceId?.toString(),
        };
      }),
      session
    );
  });
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
  const info = await stockMap(
    db,
    lines.map((l) => l.productId)
  );
  await writeLedger(
    db,
    lines.map((line) => {
      const row = info.get(line.productId.toString());
      return {
        productId: line.productId,
        sku: row?.sku,
        productName: row?.name || line.name,
        quantity: line.quantity,
        type: "INVOICE_CANCEL",
        invoiceId: ctx.invoiceId,
        invoiceNumber: ctx.invoiceNumber,
        warehouseCode: row?.warehouseCode,
        userId: ctx.userId && ObjectId.isValid(ctx.userId) ? new ObjectId(ctx.userId) : undefined,
        userName: ctx.userName,
        notes: ctx.notes || "Invoice cancelled",
        referenceId: ctx.invoiceId?.toString(),
      };
    })
  );
}

/**
 * After an invoice that already deducted stock is edited, apply only the quantity difference.
 * Positive diff = additional deduction; negative = restore.
 */
export async function applyInvoiceStockEdit(
  db: Db,
  previousItems: StockLine[],
  nextItems: StockLine[],
  ctx: DeductContext = {}
): Promise<void> {
  const diffs = stockDiffLines(previousItems, nextItems);
  const toDeduct = diffs.filter((d) => d.quantity > 0);
  const toRestore = diffs.filter((d) => d.quantity < 0).map((d) => ({ ...d, quantity: -d.quantity }));
  if (toDeduct.length) {
    await applyInvoiceDeduction(db, toDeduct, { ...ctx, type: "INVOICE", notes: ctx.notes || "Invoice edit (extra deduct)" });
  }
  if (toRestore.length) {
    await reverseInvoiceDeduction(db, toRestore, {
      ...ctx,
      notes: ctx.notes || "Invoice edit (restore difference)",
    });
  }
}

export type InwardInput = {
  productId: string;
  quantity: number;
  unit?: QtyUnit | string;
  unitsPerCase?: number;
  remarks?: string;
  movementDate?: Date;
  type?: "INWARD" | "OPENING" | "ADJUSTMENT";
  userId?: string;
  userName?: string;
  warehouseCode?: string;
};

/** Add inward / opening / adjustment stock in base units and write a ledger row. */
export async function applyInwardMovement(db: Db, input: InwardInput): Promise<{ quantity: number; baseQty: number }> {
  const pid = productObjectId(input.productId);
  if (!pid) throw new StockError("Invalid product id");

  const product = await db.collection("products").findOne({ _id: pid });
  if (!product) throw new StockError("Product not found");

  const upc = normalizeUnitsPerCase(
    input.unitsPerCase ?? (product as { unitsPerAlternate?: number }).unitsPerAlternate,
    1
  );
  const baseQty = toBaseUnits(input.quantity, input.unit || "NOS", upc);
  if (baseQty <= 0) throw new StockError("Quantity must be greater than zero");

  const now = input.movementDate || new Date();
  const col = db.collection<InventoryItemDoc>("inventoryItems");
  const existing = await col.findOne({ productId: pid });
  if (!existing) {
    await col.insertOne({
      productId: pid,
      quantity: baseQty,
      reorderLevel: 10,
      warehouseCode: input.warehouseCode || "PUNE-01",
      lastUpdated: now,
    });
  } else {
    await col.updateOne(
      { productId: pid },
      {
        $inc: { quantity: baseQty },
        $set: {
          lastUpdated: now,
          ...(input.warehouseCode ? { warehouseCode: input.warehouseCode } : {}),
        },
      }
    );
  }

  const updated = await col.findOne({ productId: pid });
  await writeLedger(db, [
    {
      productId: pid,
      sku: (product as { productCode?: string }).productCode,
      productName: (product as { name?: string }).name,
      quantity: baseQty,
      type: input.type || "INWARD",
      warehouseCode: updated?.warehouseCode,
      userId: input.userId && ObjectId.isValid(input.userId) ? new ObjectId(input.userId) : undefined,
      userName: input.userName,
      notes: input.remarks,
      referenceId: undefined,
    },
  ]);

  return { quantity: updated?.quantity ?? baseQty, baseQty };
}

/** @deprecated Use applyInvoiceDeduction. Kept for dispatch fallback. */
export async function deductInventory(db: Db, items: StockLine[]): Promise<void> {
  await applyInvoiceDeduction(db, items, { type: "dispatch_deduction" });
}
