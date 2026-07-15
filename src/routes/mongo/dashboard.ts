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
      totalDealers,
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
      inventoryItems,
      pendingDaichiDealers,
      pendingInvoiceDispatch,
    ] = await Promise.all([
      ordersCol.countDocuments(),
      ordersCol.countDocuments({ status: "PENDING_APPROVAL" }),
      ordersCol.countDocuments({ status: "APPROVED" }),
      ordersCol.countDocuments({ status: "PROCESSING" }),
      ordersCol.countDocuments({ status: "DISPATCHED" }),
      ordersCol.countDocuments({ status: "DELIVERED" }),
      invoicesCol.countDocuments(),
      invoicesCol.countDocuments({ status: "OVERDUE" }),
      invoicesCol.countDocuments({ status: "SENT" }),
      invoicesCol.countDocuments({ status: "PAID" }),
      dealersCol.countDocuments(),
      dealersCol.countDocuments({ status: "APPROVED" }),
      dealersCol.countDocuments({ status: "SUBMITTED" }),
      productsCol.countDocuments(),
      productsCol.countDocuments({ status: "ACTIVE" }),
      daichiDealersCol.countDocuments(),
      dispatchesCol.countDocuments({ status: { $nin: ["DELIVERED"] } }),
      dispatchesCol.countDocuments({ status: "DELIVERED" }),
      creditNotesCol.countDocuments({ status: "PENDING_APPROVAL" }),
      creditNotesCol.countDocuments({ status: "APPROVED" }),
      creditNotesCol.countDocuments(),
      paymentsCol.countDocuments().catch(() => 0),
      paymentsCol
        .countDocuments({ paymentDate: { $gte: monthStart } })
        .catch(() => 0),
      inventoryCol.find({}).toArray().catch(() => []),
      daichiDealersCol.countDocuments({ approvalStatus: "PENDING" }),
      invoicesCol.countDocuments({
        status: { $nin: ["CANCELLED"] },
        dispatchId: { $exists: false },
        $or: [{ logisticsStatus: "READY_FOR_DISPATCH" }, { logisticsStatus: { $exists: false } }],
      }),
    ]);

    const lowStockCount = Array.isArray(inventoryItems)
      ? inventoryItems.filter((item) => {
          const row = item as { quantity?: number; reorderLevel?: number };
          return (row.quantity ?? 0) <= (row.reorderLevel ?? 0);
        }).length
      : 0;

    const revenueResult = await invoicesCol
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
      .toArray();

    const totalRevenue = revenueResult[0]?.total || 0;
    const collectedRevenue = revenueResult[0]?.paid || 0;

    const paymentsMtdResult = await paymentsCol
      .aggregate([
        { $match: { paymentDate: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray()
      .catch(() => []);

    const paymentsMtd = paymentsMtdResult[0]?.total ?? collectedRevenue;

    const recentOrders = await ordersCol.find({}).sort({ createdAt: -1 }).limit(5).toArray();

    const pendingDealerApprovals = await dealersCol
      .find({ status: "SUBMITTED" })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const pendingOrderApprovals = await ordersCol
      .find({ status: "PENDING_APPROVAL" })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

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
        totalInventorySkus: Array.isArray(inventoryItems) ? inventoryItems.length : 0,
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
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
