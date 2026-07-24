import { Router } from "express";
import { getDb, Product, ProductCategory, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

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
    
    return res.json(products.map((p) => ({
      ...p,
      id: p._id?.toString(),
      subCategory: {
        id: p.subCategoryId?.toString(),
        name: p.subCategoryName,
        category: {
          id: p.categoryId?.toString(),
          name: p.categoryName,
        },
      },
    })));
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
    
    let product;
    
    if (ObjectId.isValid(id)) {
      product = await productsCol.findOne({ _id: new ObjectId(id) });
    }
    
    if (!product) {
      product = await productsCol.findOne({ productCode: id });
    }
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    return res.json({
      ...product,
      id: product._id?.toString(),
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
      
      const { categoryId, ...productData } = req.body;
      normalizePackaging(productData);
      
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
      
      return res.status(201).json({
        ...product,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating product:", error);
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
    const db = await getDb();
    const categoriesCol = db.collection<ProductCategory>("productCategories");
    
    const categories = await categoriesCol
      .find({})
      .sort({ name: 1 })
      .toArray();
    
    return res.json(categories.map((c) => ({
      id: c._id?.toString(),
      name: c.name,
      categoryName: c.name,
      label: c.name,
    })));
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
