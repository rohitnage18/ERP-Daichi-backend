import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const recommendations = await prisma.recommendation.findMany({
      include: {
        user: {
          select: { fullName: true },
        },
        products: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(recommendations);
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { products, ...recommendationData } = req.body;

    const recommendation = await prisma.recommendation.create({
      data: {
        ...recommendationData,
        userId: req.user!.id,
        products: {
          create: products,
        },
      },
    });

    return res.status(201).json(recommendation);
  } catch (error) {
    console.error("Error creating recommendation:", error);
    return res.status(500).json({ error: "Failed to create recommendation" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const rec = await prisma.recommendation.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { fullName: true } },
        dealer: { select: { firmName: true } },
        products: {
          include: { product: { select: { name: true, productCode: true } } },
        },
      },
    });

    if (!rec) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json(rec);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
