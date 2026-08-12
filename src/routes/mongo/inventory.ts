import { Router } from "express";
import { getDb, Product, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

interface InventoryItemDoc {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reorderLevel: number;
  warehouseCode: string;
  lastUpdated: Date;
}

/** Ensure every active product has an inventory row. */
async function ensureInventoryForProducts() {
  const db = await getDb();
  const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
  const productsCol = db.collection<Product>("products");

  const products = await productsCol.find({ status: "ACTIVE" }).toArray();
  if (products.length === 0) return;

  const existing = await inventoryCol
    .find({ productId: { $in: products.map((p) => p._id!) } })
    .project({ productId: 1 })
    .toArray();
  const have = new Set(existing.map((e) => e.productId.toString()));
  const now = new Date();
  const missing = products
    .filter((p) => p._id && !have.has(p._id.toString()))
    .map((p) => ({
      productId: p._id!,
      quantity: 0,
      reorderLevel: 10,
      warehouseCode: "PUNE-01",
      lastUpdated: now,
    }));

  if (missing.length > 0) {
    await inventoryCol.insertMany(missing);
  }
}

router.get("/", async (_req, res) => {
  try {
    await ensureInventoryForProducts();

    const db = await getDb();
    const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
    const productsCol = db.collection<Product>("products");

    const items = await inventoryCol.find({}).toArray();
    const productIds = items.map((i) => i.productId);
    const products = await productsCol.find({ _id: { $in: productIds } }).toArray();
    const productMap = new Map(products.map((p) => [p._id!.toString(), p]));

    return res.json(
      items.map((item) => {
        const product = productMap.get(item.productId.toString());
        return {
          id: item._id?.toString(),
          productId: item.productId.toString(),
          quantity: item.quantity,
          stockRemaining: item.quantity,
          reorderLevel: item.reorderLevel,
          warehouseCode: item.warehouseCode,
          lastUpdated: item.lastUpdated,
          lowStock: item.quantity <= item.reorderLevel,
          product: product
            ? {
                id: product._id?.toString(),
                productCode: product.productCode,
                name: product.name,
                packingSize: product.packingSize,
                unitOfMeasure: product.unitOfMeasure,
                categoryName: product.categoryName,
                subCategory: {
                  name: product.subCategoryName || product.categoryName || "General",
                },
              }
            : {
                productCode: "",
                name: "Unknown",
                unitOfMeasure: "Nos",
                subCategory: { name: "General" },
              },
        };
      })
    );
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

/** Adjust stock for a product (set absolute qty or delta). */
router.patch(
  "/:productId",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT", "LOGISTICS"),
  async (req, res) => {
    try {
      const { productId } = req.params;
      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      const { quantity, delta, reorderLevel, warehouseCode } = req.body as {
        quantity?: number;
        delta?: number;
        reorderLevel?: number;
        warehouseCode?: string;
      };

      const db = await getDb();
      const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
      const productsCol = db.collection<Product>("products");
      const pid = new ObjectId(productId);

      const product = await productsCol.findOne({ _id: pid });
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      let item = await inventoryCol.findOne({ productId: pid });
      const now = new Date();

      if (!item) {
        const insert = await inventoryCol.insertOne({
          productId: pid,
          quantity: 0,
          reorderLevel: 10,
          warehouseCode: "PUNE-01",
          lastUpdated: now,
        });
        item = await inventoryCol.findOne({ _id: insert.insertedId });
      }

      if (!item?._id) {
        return res.status(500).json({ error: "Failed to create inventory row" });
      }

      const itemId = item._id;
      const setDoc: Record<string, unknown> = { lastUpdated: now };
      if (Number.isFinite(Number(reorderLevel))) {
        setDoc.reorderLevel = Math.max(0, Number(reorderLevel));
      }
      if (typeof warehouseCode === "string" && warehouseCode.trim()) {
        setDoc.warehouseCode = warehouseCode.trim();
      }

      if (Number.isFinite(Number(quantity))) {
        setDoc.quantity = Math.max(0, Number(quantity));
        await inventoryCol.updateOne({ _id: itemId }, { $set: setDoc });
      } else if (Number.isFinite(Number(delta))) {
        await inventoryCol.updateOne(
          { _id: itemId },
          {
            $inc: { quantity: Number(delta) },
            $set: setDoc,
          }
        );
        await inventoryCol.updateOne(
          { _id: itemId, quantity: { $lt: 0 } },
          { $set: { quantity: 0 } }
        );
      } else if (Object.keys(setDoc).length > 1) {
        await inventoryCol.updateOne({ _id: itemId }, { $set: setDoc });
      } else {
        return res.status(400).json({ error: "Provide quantity or delta" });
      }

      const updated = await inventoryCol.findOne({ _id: itemId });
      return res.json({
        id: updated?._id?.toString(),
        productId,
        quantity: updated?.quantity ?? 0,
        stockRemaining: updated?.quantity ?? 0,
        reorderLevel: updated?.reorderLevel ?? 10,
        warehouseCode: updated?.warehouseCode,
        lastUpdated: updated?.lastUpdated,
        lowStock: (updated?.quantity ?? 0) <= (updated?.reorderLevel ?? 10),
      });
    } catch (error) {
      console.error("Error updating inventory:", error);
      return res.status(500).json({ error: "Failed to update inventory" });
    }
  }
);

export default router;
