import { Router } from "express";
import {
  getDb,
  Order,
  Invoice,
  Dealer,
  Product,
  DaichiDealer,
  Dispatch,
  CreditNote,
} from "../../lib/mongodb";
import { requireAuth } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/stats", async (_req, res) => {
  try {
    const db = await getDb();

    const ordersCol = db.collection<Order>("orders");
    const invoicesCol = db.collection<Invoice>("invoices");
    const dealersCol = db.collection<Dealer>("dealers");
    const productsCol = db.collection<Product>("products");
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const dispatchesCol = db.collection<Dispatch>("dispatches");
    const creditNotesCol = db.collection<CreditNote>("creditNotes");
    const inventoryCol = db.collection("inventoryItems");
    const paymentsCol = db.collection("payments");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      pendingOrders,
      approvedOrders,
      processingOrders,
      dispatchedOrders,
      deliveredOrders,
      totalInvoices,
      overdueInvoices,
      sentInvoices,
      paidInvoices,
      approvedDealers,
      submittedDealers,
      totalProducts,
      activeProducts,
      totalDaichiDealers,
      activeDispatches,
      deliveredDispatches,
      pendingCreditNotes,
      approvedCreditNotes,
      totalCreditNotes,
      totalPayments,
      paymentsThisMonth,
      totalInventorySkus,
      lowStockCount,
      pendingDaichiDealers,
      pendingInvoiceDispatch,
      revenueResult,
      paymentsMtdResult,
      recentOrders,
      pendingDealerApprovals,
      pendingOrderApprovals,
      pendingCreditNoteApprovals,
    ] = await Promise.all([
      ordersCol.estimatedDocumentCount(),
      ordersCol.countDocuments({ status: "PENDING_APPROVAL" }),
      ordersCol.countDocuments({ status: "APPROVED" }),
      ordersCol.countDocuments({ status: "PROCESSING" }),
      ordersCol.countDocuments({ status: "DISPATCHED" }),
      ordersCol.countDocuments({ status: "DELIVERED" }),
      invoicesCol.estimatedDocumentCount(),
      invoicesCol.countDocuments({ status: "OVERDUE" }),
      invoicesCol.countDocuments({ status: "SENT" }),
      invoicesCol.countDocuments({ status: "PAID" }),
      dealersCol.countDocuments({ status: "APPROVED" }),
      dealersCol.countDocuments({ status: "SUBMITTED" }),
      productsCol.estimatedDocumentCount(),
      productsCol.countDocuments({ status: "ACTIVE" }),
      daichiDealersCol.estimatedDocumentCount(),
      dispatchesCol.countDocuments({ status: { $nin: ["DELIVERED"] } }),
      dispatchesCol.countDocuments({ status: "DELIVERED" }),
      creditNotesCol.countDocuments({ status: "PENDING_APPROVAL" }),
      creditNotesCol.countDocuments({ status: "APPROVED" }),
      creditNotesCol.estimatedDocumentCount(),
      paymentsCol.estimatedDocumentCount().catch(() => 0),
      paymentsCol
        .countDocuments({ paymentDate: { $gte: monthStart } })
        .catch(() => 0),
      inventoryCol.estimatedDocumentCount().catch(() => 0),
      inventoryCol
        .countDocuments({
          $expr: {
            $lte: ["$quantity", { $ifNull: ["$reorderLevel", 0] }],
          },
        })
        .catch(() => 0),
      daichiDealersCol.countDocuments({ approvalStatus: "PENDING" }),
      invoicesCol.countDocuments({
        status: { $nin: ["CANCELLED"] },
        dispatchId: { $exists: false },
        $or: [{ logisticsStatus: "READY_FOR_DISPATCH" }, { logisticsStatus: { $exists: false } }],
      }),
      invoicesCol
        .aggregate([
          { $match: { status: { $in: ["SENT", "PAID", "OVERDUE"] } } },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
              paid: { $sum: "$paidAmount" },
            },
          },
        ])
        .toArray(),
      paymentsCol
        .aggregate([
          { $match: { paymentDate: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray()
        .catch(() => []),
      ordersCol.find({}).sort({ createdAt: -1 }).limit(5).toArray(),
      dealersCol.find({ status: "SUBMITTED" }).sort({ createdAt: -1 }).limit(5).toArray(),
      ordersCol
        .find({ status: "PENDING_APPROVAL" })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray(),
      creditNotesCol
        .find({ status: "PENDING_APPROVAL" })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray(),
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;
    const collectedRevenue = revenueResult[0]?.paid || 0;
    const paymentsMtd = paymentsMtdResult[0]?.total ?? collectedRevenue;

    return res.json({
      stats: {
        totalOrders,
        pendingOrders,
        approvedOrders,
        processingOrders,
        dispatchedOrders,
        deliveredOrders,
        pendingDispatch: approvedOrders,
        activeDispatches,
        deliveredDispatches,
        totalInvoices,
        overdueInvoices,
        sentInvoices,
        paidInvoices,
        totalDealers: totalDaichiDealers,
        approvedDealers,
        submittedDealers,
        pendingDaichiDealers,
        pendingDealerApprovals: submittedDealers + pendingDaichiDealers,
        pendingInvoiceDispatch,
        totalProducts,
        activeProducts,
        lowStockCount,
        totalInventorySkus,
        totalRevenue,
        collectedRevenue,
        outstandingRevenue: totalRevenue - collectedRevenue,
        paymentsMtd,
        totalPayments,
        paymentsThisMonth,
        pendingCreditNotes,
        approvedCreditNotes,
        totalCreditNotes,
      },
      recentOrders: recentOrders.map((o) => ({
        ...o,
        id: o._id?.toString(),
      })),
      pendingApprovals: {
        dealers: pendingDealerApprovals.map((d) => ({
          ...d,
          id: d._id?.toString(),
        })),
        orders: pendingOrderApprovals.map((o) => ({
          ...o,
          id: o._id?.toString(),
        })),
        creditNotes: pendingCreditNoteApprovals.map((c) => ({
          ...c,
          id: c._id?.toString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
