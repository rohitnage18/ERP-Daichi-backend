import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        dealer: {
          select: { firmName: true, dealerCode: true },
        },
        recordedBy: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { dealerId, paymentMode, amount, referenceNumber, paymentDate, notes } = req.body;

    if (!dealerId || !paymentMode || amount == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const num = Number(amount);
    if (Number.isNaN(num) || num <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const payment = await prisma.payment.create({
      data: {
        dealerId,
        paymentMode,
        amount: num,
        netAmount: num,
        tdsDeducted: 0,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        referenceNumber: referenceNumber?.trim() || null,
        notes: notes?.trim() || null,
        recordedById: req.user!.id,
      },
    });

    return res.status(201).json(payment);
  } catch (error) {
    console.error("Error creating payment:", error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

export default router;
