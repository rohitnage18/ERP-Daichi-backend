import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const creditNotes = await prisma.creditNote.findMany({
      include: {
        dealer: {
          select: { firmName: true },
        },
        invoice: {
          select: { invoiceNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(creditNotes);
  } catch (error) {
    console.error("Error fetching credit notes:", error);
    return res.status(500).json({ error: "Failed to fetch credit notes" });
  }
});

export default router;
