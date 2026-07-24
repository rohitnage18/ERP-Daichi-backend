import { Router } from "express";
import { getDb, DebitNote, Invoice, ObjectId } from "../../lib/mongodb";
import { generateDebitNoteNumber } from "../../lib/utils";
import { requireAuth, requireRole } from "../../middleware/auth";
import { recomputeInvoiceBalance } from "../../lib/invoice-balance";

const router = Router();

router.use(requireAuth);

async function nextDebitNoteNumber(): Promise<string> {
  const db = await getDb();
  const col = db.collection<DebitNote>("debitNotes");
  const count = await col.countDocuments();
  return generateDebitNoteNumber(count + 1);
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DebitNote>("debitNotes");
    const { status } = req.query;

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const debitNotes = await col.find(filter).sort({ createdAt: -1 }).toArray();

    return res.json(
      debitNotes.map((dn) => ({
        ...dn,
        id: dn._id?.toString(),
        dealer: { firmName: dn.dealerName || "" },
        invoice: { invoiceNumber: dn.invoiceNumber || "" },
      }))
    );
  } catch (error) {
    console.error("Error fetching debit notes:", error);
    return res.status(500).json({ error: "Failed to fetch debit notes" });
  }
});

router.post("/", requireRole("ACCOUNT"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DebitNote>("debitNotes");
    const invoicesCol = db.collection<Invoice>("invoices");

    const { invoiceId, type, reason, amount } = req.body;

    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ error: "Valid invoice ID is required" });
    }
    if (!type?.trim() || !reason?.trim()) {
      return res.status(400).json({ error: "Type and reason are required" });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const invoice = await invoicesCol.findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const debitNoteNumber = await nextDebitNoteNumber();

    const debitNote: DebitNote = {
      debitNoteNumber,
      debitNoteDate: new Date(),
      invoiceId: invoice._id!,
      invoiceNumber: invoice.invoiceNumber,
      dealerId: invoice.dealerId,
      dealerName: invoice.dealerName,
      type: type.trim(),
      reason: reason.trim(),
      amount: Number(amount),
      appliedToInvoice: false,
      status: "PENDING_APPROVAL",
      createdById: new ObjectId(req.user!.id),
      createdByName: req.user!.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await col.insertOne(debitNote);

    return res.status(201).json({
      ...debitNote,
      id: result.insertedId.toString(),
      _id: result.insertedId,
      dealer: { firmName: debitNote.dealerName || "" },
      invoice: { invoiceNumber: debitNote.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error creating debit note:", error);
    return res.status(500).json({ error: "Failed to create debit note" });
  }
});

router.post("/:id/approve", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DebitNote>("debitNotes");
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid debit note ID" });
    }

    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(id), status: "PENDING_APPROVAL" },
      {
        $set: {
          status: "APPROVED",
          approvedById: new ObjectId(req.user!.id),
          approvedByName: req.user!.email,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Debit note not found or not pending approval" });
    }

    // A debit note increases the amount owed on the linked invoice (once).
    if (!result.appliedToInvoice && result.invoiceId) {
      const invoicesCol = db.collection<Invoice>("invoices");
      await invoicesCol.updateOne(
        { _id: result.invoiceId },
        { $inc: { debitAdjustment: result.amount } }
      );
      await recomputeInvoiceBalance(db, result.invoiceId);
      await col.updateOne({ _id: result._id }, { $set: { appliedToInvoice: true } });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
      dealer: { firmName: result.dealerName || "" },
      invoice: { invoiceNumber: result.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error approving debit note:", error);
    return res.status(500).json({ error: "Failed to approve debit note" });
  }
});

router.post("/:id/reject", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DebitNote>("debitNotes");
    const { id } = req.params;
    const { reason } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid debit note ID" });
    }

    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(id), status: "PENDING_APPROVAL" },
      {
        $set: {
          status: "REJECTED",
          rejectionReason: reason || "Rejected by admin",
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Debit note not found or not pending approval" });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
      dealer: { firmName: result.dealerName || "" },
      invoice: { invoiceNumber: result.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error rejecting debit note:", error);
    return res.status(500).json({ error: "Failed to reject debit note" });
  }
});

export default router;
