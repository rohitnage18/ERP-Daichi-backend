import { Router } from "express";
import { getDb, Invoice, Payment, PaymentAllocation, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { findDealerById } from "../../lib/dealer-lookup";
import { deriveBalance, deriveStatus } from "../../lib/invoice-balance";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("ACCOUNT", "MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const db = await getDb();
    const paymentsCol = db.collection<Payment>("payments");

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

/** Total outstanding across all open invoices, so Accounts sees a real figure. */
router.get("/outstanding", requireRole("ACCOUNT", "MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");
    const rows = await invoicesCol
      .find({ status: { $nin: ["CANCELLED", "DRAFT"] } })
      .project<{ balanceAmount: number; dueDate: Date; status: string }>({
        balanceAmount: 1,
        dueDate: 1,
        status: 1,
      })
      .toArray();

    const now = Date.now();
    let totalOutstanding = 0;
    let overdueOutstanding = 0;
    let openInvoices = 0;
    for (const r of rows) {
      const bal = Number(r.balanceAmount) || 0;
      if (bal <= 0.01) continue;
      openInvoices += 1;
      totalOutstanding += bal;
      if (r.dueDate && new Date(r.dueDate).getTime() < now) {
        overdueOutstanding += bal;
      }
    }

    return res.json({
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      overdueOutstanding: Math.round(overdueOutstanding * 100) / 100,
      openInvoices,
    });
  } catch (error) {
    console.error("Error computing outstanding:", error);
    return res.status(500).json({ error: "Failed to compute outstanding" });
  }
});

router.post("/", requireRole("ACCOUNT", "MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const { dealerId, paymentMode, amount, referenceNumber, paymentDate, notes, invoiceId } =
      req.body;

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
    const paymentsCol = db.collection<Payment>("payments");
    const invoicesCol = db.collection<Invoice>("invoices");

    // Determine which invoices to apply the payment to.
    // If a specific invoice is provided, apply to it first; otherwise FIFO by due date.
    const openFilter: Record<string, unknown> = {
      dealerId: dealer._id,
      status: { $nin: ["CANCELLED", "DRAFT"] },
      balanceAmount: { $gt: 0 },
    };

    let openInvoices: Invoice[] = [];
    if (invoiceId && ObjectId.isValid(invoiceId)) {
      const specific = await invoicesCol.findOne({
        _id: new ObjectId(invoiceId),
        dealerId: dealer._id,
      });
      const others = await invoicesCol
        .find({ ...openFilter, _id: { $ne: new ObjectId(invoiceId) } })
        .sort({ dueDate: 1, invoiceDate: 1 })
        .toArray();
      openInvoices = [...(specific && (specific.balanceAmount || 0) > 0 ? [specific] : []), ...others];
    } else {
      openInvoices = await invoicesCol
        .find(openFilter)
        .sort({ dueDate: 1, invoiceDate: 1 })
        .toArray();
    }

    // Allocate the payment across invoices.
    let remaining = num;
    const allocations: PaymentAllocation[] = [];
    for (const inv of openInvoices) {
      if (remaining <= 0.01) break;
      const bal = Number(inv.balanceAmount) || 0;
      if (bal <= 0) continue;
      const applied = Math.min(bal, remaining);
      remaining = Math.round((remaining - applied) * 100) / 100;

      const newPaid = (Number(inv.paidAmount) || 0) + applied;
      const newBalance = deriveBalance({
        totalAmount: inv.totalAmount,
        paidAmount: newPaid,
        creditAdjustment: inv.creditAdjustment,
        debitAdjustment: inv.debitAdjustment,
      });
      const newStatus = deriveStatus(inv.status, inv.totalAmount, newBalance);

      await invoicesCol.updateOne(
        { _id: inv._id },
        {
          $set: {
            paidAmount: Math.round(newPaid * 100) / 100,
            balanceAmount: newBalance,
            status: newStatus,
            updatedAt: new Date(),
          },
        }
      );

      allocations.push({
        invoiceId: inv._id!,
        invoiceNumber: inv.invoiceNumber,
        amount: Math.round(applied * 100) / 100,
      });
    }

    const payment: Payment = {
      dealerId: dealer._id,
      dealerName: dealer.firmName,
      paymentMode,
      amount: num,
      netAmount: num,
      tdsDeducted: 0,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNumber: referenceNumber?.trim() || undefined,
      notes: notes?.trim() || undefined,
      allocations,
      unallocatedAmount: Math.round(remaining * 100) / 100,
      recordedById: new ObjectId(req.user!.id),
      recordedByName: req.user!.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await paymentsCol.insertOne(payment);

    return res.status(201).json({
      ...payment,
      id: result.insertedId.toString(),
      allocatedCount: allocations.length,
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

export default router;
