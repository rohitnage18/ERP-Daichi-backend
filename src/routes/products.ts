import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: {
        subCategory: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (req.user!.role !== "MANAGEMENT_ADMIN") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const product = await prisma.product.create({
      data: req.body,
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
});

export const productCategoriesRouter = Router();
productCategoriesRouter.use(requireAuth);
productCategoriesRouter.get("/", async (_req, res) => {
  try {
    const subCategories = await prisma.productSubCategory.findMany({
      include: { category: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });

    return res.json(
      subCategories.map((s) => ({
        id: s.id,
        name: s.name,
        categoryName: s.category.name,
        label: `${s.category.name} › ${s.name}`,
      }))
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch" });
  }
});

export default router;
