import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const zones = await prisma.zone.findMany({
      include: {
        districts: {
          orderBy: { name: "asc" },
        },
        division: true,
      },
      orderBy: { name: "asc" },
    });

    return res.json(zones);
  } catch (error) {
    console.error("Error fetching zones:", error);
    return res.status(500).json({ error: "Failed to fetch zones" });
  }
});

export default router;
