import { Db, ObjectId } from "mongodb";

type InventoryItemDoc = {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reorderLevel: number;
  warehouseCode: string;
  lastUpdated: Date;
};

/**
 * Deduct billed quantities from warehouse stock.
 * Best-effort: never throws so billing cannot fail because of a stock hiccup.
 */
export async function deductInventory(
  db: Db,
  items: { productId?: ObjectId | string | null; quantity?: number }[]
): Promise<void> {
  try {
    const now = new Date();
    const col = db.collection<InventoryItemDoc>("inventoryItems");
    const ops = items
      .map((item) => {
        const raw = item?.productId;
        const id =
          raw instanceof ObjectId
            ? raw
            : typeof raw === "string" && ObjectId.isValid(raw)
              ? new ObjectId(raw)
              : null;
        const qty = Math.abs(Number(item.quantity) || 0);
        if (!id || qty <= 0) return null;
        return {
          updateOne: {
            filter: { productId: id },
            update: {
              $inc: { quantity: -qty },
              $set: { lastUpdated: now },
            },
            upsert: false,
          },
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (ops.length === 0) return;
    await col.bulkWrite(ops);
    await col.updateMany({ quantity: { $lt: 0 } }, { $set: { quantity: 0 } });
  } catch (error) {
    console.error("Inventory deduction failed (non-fatal):", error);
  }
}
