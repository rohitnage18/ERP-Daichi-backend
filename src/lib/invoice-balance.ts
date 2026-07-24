import { Db } from "mongodb";
import { Invoice, ObjectId } from "./mongodb";

/**
 * Single source of truth for an invoice's outstanding balance.
 * balance = totalAmount - paidAmount - creditAdjustment + debitAdjustment
 */
export function deriveBalance(inv: Pick<Invoice, "totalAmount" | "paidAmount" | "creditAdjustment" | "debitAdjustment">): number {
  const total = Number(inv.totalAmount) || 0;
  const paid = Number(inv.paidAmount) || 0;
  const credit = Number(inv.creditAdjustment) || 0;
  const debit = Number(inv.debitAdjustment) || 0;
  const balance = total - paid - credit + debit;
  // Guard against floating point dust.
  return Math.round(balance * 100) / 100;
}

export function deriveStatus(
  current: Invoice["status"],
  totalAmount: number,
  balance: number
): Invoice["status"] {
  // Never override a cancelled invoice.
  if (current === "CANCELLED") return "CANCELLED";
  if (balance <= 0.01) return "PAID";
  if (balance < Math.round(totalAmount * 100) / 100 - 0.01) return "PARTIALLY_PAID";
  // Nothing paid yet: keep whatever open state it was in (DRAFT/SENT/OVERDUE).
  if (current === "PAID" || current === "PARTIALLY_PAID") return "SENT";
  return current;
}

/**
 * Recompute and persist balanceAmount + status for a single invoice.
 * Returns the updated balance.
 */
export async function recomputeInvoiceBalance(db: Db, invoiceId: ObjectId): Promise<number | null> {
  const invoicesCol = db.collection<Invoice>("invoices");
  const inv = await invoicesCol.findOne({ _id: invoiceId });
  if (!inv) return null;

  const balance = deriveBalance(inv);
  const status = deriveStatus(inv.status, inv.totalAmount, balance);

  await invoicesCol.updateOne(
    { _id: invoiceId },
    { $set: { balanceAmount: balance, status, updatedAt: new Date() } }
  );
  return balance;
}

/** Total open balance for a dealer across all non-cancelled invoices. */
export async function dealerOutstanding(db: Db, dealerId: ObjectId): Promise<number> {
  const invoicesCol = db.collection<Invoice>("invoices");
  const rows = await invoicesCol
    .find({ dealerId, status: { $nin: ["CANCELLED"] } })
    .project<{ balanceAmount: number }>({ balanceAmount: 1 })
    .toArray();
  const total = rows.reduce((sum, r) => sum + (Number(r.balanceAmount) || 0), 0);
  return Math.round(total * 100) / 100;
}
