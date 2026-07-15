import { Router } from "express";
import { getDb, CreditNote, Invoice, ObjectId } from "../../lib/mongodb";
import { generateCreditNoteNumber } from "../../lib/utils";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

async function nextCreditNoteNumber(): Promise<string> {
  const db = await getDb();
  const col = db.collection<CreditNote>("creditNotes");
  const count = await col.countDocuments();
  return generateCreditNoteNumber(count + 1);
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<CreditNote>("creditNotes");
    const { status } = req.query;

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const creditNotes = await col.find(filter).sort({ createdAt: -1 }).toArray();

    return res.json(
      creditNotes.map((cn) => ({
        ...cn,
        id: cn._id?.toString(),
        dealer: { firmName: cn.dealerName || "" },
        invoice: { invoiceNumber: cn.invoiceNumber || "" },
      }))
    );
  } catch (error) {
    console.error("Error fetching credit notes:", error);
    return res.status(500).json({ error: "Failed to fetch credit notes" });
  }
});

router.post("/", requireRole("ACCOUNT"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<CreditNote>("creditNotes");
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

    const creditNoteNumber = await nextCreditNoteNumber();

    const creditNote: CreditNote = {
      creditNoteNumber,
      creditNoteDate: new Date(),
      invoiceId: invoice._id!,
      invoiceNumber: invoice.invoiceNumber,
      dealerId: invoice.dealerId,
      dealerName: invoice.dealerName,
      type: type.trim(),
      reason: reason.trim(),
      amount: Number(amount),
      status: "PENDING_APPROVAL",
      createdById: new ObjectId(req.user!.id),
      createdByName: req.user!.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await col.insertOne(creditNote);

    return res.status(201).json({
      ...creditNote,
      id: result.insertedId.toString(),
      _id: result.insertedId,
      dealer: { firmName: creditNote.dealerName || "" },
      invoice: { invoiceNumber: creditNote.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error creating credit note:", error);
    return res.status(500).json({ error: "Failed to create credit note" });
  }
});

router.post("/:id/approve", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<CreditNote>("creditNotes");
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid credit note ID" });
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
      return res.status(404).json({ error: "Credit note not found or not pending approval" });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
      dealer: { firmName: result.dealerName || "" },
      invoice: { invoiceNumber: result.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error approving credit note:", error);
    return res.status(500).json({ error: "Failed to approve credit note" });
  }
});

router.post("/:id/reject", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<CreditNote>("creditNotes");
    const { id } = req.params;
    const { reason } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid credit note ID" });
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
      return res.status(404).json({ error: "Credit note not found or not pending approval" });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
      dealer: { firmName: result.dealerName || "" },
      invoice: { invoiceNumber: result.invoiceNumber || "" },
    });
  } catch (error) {
    console.error("Error rejecting credit note:", error);
    return res.status(500).json({ error: "Failed to reject credit note" });
  }
});

export default router;
