import { Router } from "express";
import { getDb, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { findDealerById } from "../../lib/dealer-lookup";

const router = Router();

router.use(requireAuth);

interface PaymentDoc {
  _id?: ObjectId;
  dealerId: ObjectId;
  dealerName?: string;
  paymentMode: string;
  amount: number;
  netAmount: number;
  tdsDeducted: number;
  paymentDate: Date;
  referenceNumber?: string;
  notes?: string;
  recordedById: ObjectId;
  recordedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

router.get("/", requireRole("ACCOUNT", "MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const db = await getDb();
    const paymentsCol = db.collection<PaymentDoc>("payments");

    const payments = await paymentsCol.find({}).sort({ createdAt: -1 }).limit(500).toArray();

    return res.json(
      payments.map((p) => ({
        ...p,
        id: p._id?.toString(),
        dealer: {
          firmName: p.dealerName,
        },
        recordedBy: {
          fullName: p.recordedByName,
        },
      }))
    );
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
});

router.post("/", requireRole("ACCOUNT", "MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const { dealerId, paymentMode, amount, referenceNumber, paymentDate, notes } = req.body;

    if (!dealerId || !paymentMode || amount == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const num = Number(amount);
    if (Number.isNaN(num) || num <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const dealer = await findDealerById(dealerId);
    if (!dealer) {
      return res.status(404).json({ error: "Dealer not found" });
    }

    const db = await getDb();
    const paymentsCol = db.collection<PaymentDoc>("payments");

    const payment: PaymentDoc = {
      dealerId: dealer._id,
      dealerName: dealer.firmName,
      paymentMode,
      amount: num,
      netAmount: num,
      tdsDeducted: 0,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNumber: referenceNumber?.trim() || undefined,
      notes: notes?.trim() || undefined,
      recordedById: new ObjectId(req.user!.id),
      recordedByName: req.user!.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await paymentsCol.insertOne(payment);

    return res.status(201).json({
      ...payment,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

export default router;
