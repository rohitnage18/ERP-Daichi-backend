import { Router } from "express";
import { getDb, Product, ProductCategory, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { PRODUCT_CATEGORY_NAMES } from "../../lib/product-categories";

const router = Router();

router.use(requireAuth);

/**
 * Normalise packaging fields: coerce numeric conversion and (re)generate a
 * lotSize string so the invoice/billing case-label logic keeps working.
 */
function normalizePackaging(data: Record<string, unknown>): void {
  if (data.unitsPerAlternate != null && data.unitsPerAlternate !== "") {
    data.unitsPerAlternate = Number(data.unitsPerAlternate);
  }
  if (data.basePrice != null && data.basePrice !== "") data.basePrice = Number(data.basePrice);
  if (data.mrp != null && data.mrp !== "") data.mrp = Number(data.mrp);
  if (data.gstRate != null && data.gstRate !== "") data.gstRate = Number(data.gstRate);

  const size = (data.packingSize as string) || "";
  const units = Number(data.unitsPerAlternate);
  if (size && units > 0) {
    // Format understood by parseUnitsPerCase(): "<size> * <n> unit".
    data.lotSize = `${size} * ${units} unit`;
  }
}

async function ensureCanonicalCategories() {
  const db = await getDb();
  const categoriesCol = db.collection<ProductCategory>("productCategories");
  const now = new Date();
  for (let i = 0; i < PRODUCT_CATEGORY_NAMES.length; i++) {
    const name = PRODUCT_CATEGORY_NAMES[i];
    await categoriesCol.updateOne(
      { name },
      {
        $set: { sortOrder: i + 1, updatedAt: now },
        $setOnInsert: { name, description: name, createdAt: now },
      },
      { upsert: true }
    );
  }
}

async function stockMapForProducts(productIds: ObjectId[]) {
  const db = await getDb();
  const inventoryCol = db.collection<{
    productId: ObjectId;
    quantity: number;
    reorderLevel: number;
  }>("inventoryItems");
  if (productIds.length === 0) return new Map<string, { quantity: number; reorderLevel: number }>();
  const rows = await inventoryCol.find({ productId: { $in: productIds } }).toArray();
  return new Map(
    rows.map((r) => [
      r.productId.toString(),
      { quantity: r.quantity ?? 0, reorderLevel: r.reorderLevel ?? 10 },
    ])
  );
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const productsCol = db.collection<Product>("products");
    
    const { status, categoryId, q } = req.query;
    
    const filter: Record<string, unknown> = {};
    
    if (status && status !== "all") {
      filter.status = status;
    } else {
      filter.status = "ACTIVE";
    }
    
    if (categoryId && ObjectId.isValid(categoryId as string)) {
      filter.categoryId = new ObjectId(categoryId as string);
    }
    
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { productCode: { $regex: q, $options: "i" } },
        { hsnCode: { $regex: q, $options: "i" } },
      ];
    }
    
    const products = await productsCol
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    const stockByProduct = await stockMapForProducts(
      products.map((p) => p._id!).filter(Boolean)
    );
    
    return res.json(products.map((p) => {
      const stock = stockByProduct.get(p._id!.toString());
      const stockRemaining = stock?.quantity ?? 0;
      const reorderLevel = stock?.reorderLevel ?? 10;
      return {
        ...p,
        id: p._id?.toString(),
        stockRemaining,
        reorderLevel,
        lowStock: stockRemaining <= reorderLevel,
        subCategory: {
          id: p.subCategoryId?.toString(),
          name: p.subCategoryName,
          category: {
            id: p.categoryId?.toString(),
            name: p.categoryName,
          },
        },
      };
    }));
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const productsCol = db.collection<Product>("products");
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await productsCol.findOne({ _id: new ObjectId(id) });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const stockByProduct = await stockMapForProducts([product._id!]);
    const stock = stockByProduct.get(product._id!.toString());
    const stockRemaining = stock?.quantity ?? 0;
    const reorderLevel = stock?.reorderLevel ?? 10;

    return res.json({
      ...product,
      id: product._id?.toString(),
      stockRemaining,
      reorderLevel,
      lowStock: stockRemaining <= reorderLevel,
      category: {
        id: product.categoryId?.toString(),
        name: product.categoryName,
      },
      subCategory: {
        id: product.subCategoryId?.toString(),
        name: product.subCategoryName,
        category: {
          id: product.categoryId?.toString(),
          name: product.categoryName,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.post(
  "/",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const productsCol = db.collection<Product>("products");
      const categoriesCol = db.collection<ProductCategory>("productCategories");
      const inventoryCol = db.collection("inventoryItems");
      
      const { categoryId, openingStock, reorderLevel, ...productData } = req.body;

      const productCode = typeof productData.productCode === "string" ? productData.productCode.trim() : "";
      const name = typeof productData.name === "string" ? productData.name.trim() : "";
      if (!productCode) {
        return res.status(400).json({ error: "Product code is required." });
      }
      if (!name) {
        return res.status(400).json({ error: "Product name is required." });
      }
      productData.productCode = productCode;
      productData.name = name;

      normalizePackaging(productData);

      if (!Number.isFinite(productData.basePrice as number)) {
        return res.status(400).json({ error: "Base price must be a valid number." });
      }
      if (!Number.isFinite(productData.gstRate as number)) {
        return res.status(400).json({ error: "GST rate must be a valid number." });
      }

      const existing = await productsCol.findOne({ productCode });
      if (existing) {
        return res
          .status(409)
          .json({ error: `A product with code "${productCode}" already exists.` });
      }
      
      let category;
      if (categoryId && ObjectId.isValid(categoryId)) {
        category = await categoriesCol.findOne({ _id: new ObjectId(categoryId) });
      }
      
      const product: Product = {
        ...productData,
        categoryId: category ? new ObjectId(categoryId) : undefined,
        categoryName: category?.name,
        status: productData.status || "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = await productsCol.insertOne(product);
      const stockQty = Math.max(0, Number(openingStock) || 0);
      const reorder = Math.max(0, Number(reorderLevel) || 10);
      await inventoryCol.insertOne({
        productId: result.insertedId,
        quantity: stockQty,
        reorderLevel: reorder,
        warehouseCode: "PUNE-01",
        lastUpdated: new Date(),
      });
      
      return res.status(201).json({
        ...product,
        id: result.insertedId.toString(),
        _id: result.insertedId,
        stockRemaining: stockQty,
        reorderLevel: reorder,
      });
    } catch (error) {
      console.error("Error creating product:", error);
      if ((error as { code?: number }).code === 11000) {
        return res
          .status(409)
          .json({ error: "A product with this code already exists." });
      }
      return res.status(500).json({ error: "Failed to create product" });
    }
  }
);

router.patch(
  "/:id",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const productsCol = db.collection<Product>("products");
      
      const { id } = req.params;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      
      const updateData = {
        ...req.body,
        updatedAt: new Date(),
      };
      
      delete updateData._id;
      delete updateData.id;
      normalizePackaging(updateData);

      // Resolve category name if category changed.
      if (updateData.categoryId && ObjectId.isValid(updateData.categoryId)) {
        const categoriesCol = db.collection<ProductCategory>("productCategories");
        const category = await categoriesCol.findOne({
          _id: new ObjectId(updateData.categoryId as string),
        });
        updateData.categoryId = new ObjectId(updateData.categoryId as string);
        if (category) updateData.categoryName = category.name;
      }
      
      const result = await productsCol.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ error: "Failed to update product" });
    }
  }
);

export default router;

export const productCategoriesRouter = Router();

productCategoriesRouter.use(requireAuth);

productCategoriesRouter.get("/", async (_req, res) => {
  try {
    await ensureCanonicalCategories();
    const db = await getDb();
    const categoriesCol = db.collection<ProductCategory>("productCategories");

    const keep = new Set<string>(PRODUCT_CATEGORY_NAMES as unknown as string[]);
    const categories = await categoriesCol.find({}).toArray();

    // Prefer canonical list order; hide junk single-char/number names
    const filtered = categories.filter((c) => {
      if (keep.has(c.name)) return true;
      if (/^([1-9]|1[01]|[A-D]|Product Category)$/i.test(c.name.trim())) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const ai = PRODUCT_CATEGORY_NAMES.indexOf(a.name as (typeof PRODUCT_CATEGORY_NAMES)[number]);
      const bi = PRODUCT_CATEGORY_NAMES.indexOf(b.name as (typeof PRODUCT_CATEGORY_NAMES)[number]);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name);
    });

    return res.json(
      filtered.map((c) => ({
        id: c._id?.toString(),
        name: c.name,
        categoryName: c.name,
        label: c.name,
      }))
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

productCategoriesRouter.post(
  "/",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const categoriesCol = db.collection<ProductCategory>("productCategories");
      
      const category: ProductCategory = {
        name: req.body.name,
        description: req.body.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = await categoriesCol.insertOne(category);
      
      return res.status(201).json({
        ...category,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating category:", error);
      return res.status(500).json({ error: "Failed to create category" });
    }
  }
);
