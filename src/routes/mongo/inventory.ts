import { Router } from "express";
import { getDb, Product, ObjectId } from "../../lib/mongodb";
import { requireAuth } from "../../middleware/auth";

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

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
    const productsCol = db.collection<Product>("products");

    let items = await inventoryCol.find({}).toArray();

    if (items.length === 0) {
      const products = await productsCol.find({ status: "ACTIVE" }).toArray();
      if (products.length > 0) {
        const now = new Date();
        const seedItems = products.map((p) => ({
          productId: p._id!,
          quantity: 100,
          reorderLevel: 10,
          warehouseCode: "PUNE-01",
          lastUpdated: now,
        }));
        await inventoryCol.insertMany(seedItems);
        items = await inventoryCol.find({}).toArray();
      }
    }

    const productIds = items.map((i) => i.productId);
    const products = await productsCol.find({ _id: { $in: productIds } }).toArray();
    const productMap = new Map(products.map((p) => [p._id!.toString(), p]));

    return res.json(
      items.map((item) => {
        const product = productMap.get(item.productId.toString());
        return {
          id: item._id?.toString(),
          quantity: item.quantity,
          reorderLevel: item.reorderLevel,
          warehouseCode: item.warehouseCode,
          lastUpdated: item.lastUpdated,
          product: product
            ? {
                productCode: product.productCode,
                name: product.name,
                unitOfMeasure: product.unitOfMeasure,
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

export default router;
