import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const inventory = await prisma.inventoryItem.findMany({
      include: {
        product: {
          include: {
            subCategory: true,
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    return res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

export default router;
