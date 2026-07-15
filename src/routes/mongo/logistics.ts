import { Router } from "express";
import { getDb, Dispatch, Invoice, Order, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("PRODUCTION_LOGISTICS", "MANAGEMENT_ADMIN"));

router.get("/queue", async (_req, res) => {
  try {
    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");
    const ordersCol = db.collection<Order>("orders");
    const dispatchesCol = db.collection<Dispatch>("dispatches");

    const [pendingInvoices, pendingOrders, dispatches] = await Promise.all([
      invoicesCol
        .find({
          status: { $nin: ["CANCELLED"] },
          dispatchId: { $exists: false },
          $or: [
            { logisticsStatus: "READY_FOR_DISPATCH" },
            { logisticsStatus: { $exists: false } },
          ],
        })
        .sort({ invoiceDate: -1 })
        .limit(200)
        .toArray(),
      ordersCol
        .find({
          status: "APPROVED",
        })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray(),
      dispatchesCol.find({}).sort({ createdAt: -1 }).limit(300).toArray(),
    ]);

    const dispatchByOrder = new Map(
      dispatches.filter((d) => d.orderId).map((d) => [d.orderId!.toString(), d])
    );
    const dispatchByInvoice = new Map(
      dispatches.filter((d) => d.invoiceId).map((d) => [d.invoiceId!.toString(), d])
    );

    const ordersWithoutDispatch = pendingOrders
      .filter((o) => !dispatchByOrder.has(o._id!.toString()))
      .map((o) => ({
        id: o._id?.toString(),
        type: "order" as const,
        referenceNumber: o.orderNumber,
        dealerName: o.dealerName,
        dealerCity: o.dealerCity,
        deliveryAddress: o.deliveryAddress,
        totalAmount: o.totalAmount,
        date: o.orderDate,
        status: o.status,
      }));

    const invoicesReady = pendingInvoices
      .filter((inv) => !dispatchByInvoice.has(inv._id!.toString()))
      .map((inv) => ({
        id: inv._id?.toString(),
        type: "invoice" as const,
        referenceNumber: inv.invoiceNumber,
        dealerName: inv.dealerName,
        dealerCity: inv.dealerCity,
        deliveryAddress: inv.shippingAddress || inv.dealerAddress,
        totalAmount: inv.totalAmount,
        date: inv.invoiceDate,
        status: inv.status,
        logisticsStatus: inv.logisticsStatus || "READY_FOR_DISPATCH",
      }));

    const activeDispatches = dispatches
      .filter((d) => d.status !== "DELIVERED")
      .map((d) => ({
        id: d._id?.toString(),
        dispatchNumber: d.dispatchNumber,
        type: d.invoiceId ? ("invoice" as const) : ("order" as const),
        referenceId: (d.invoiceId || d.orderId)?.toString(),
        referenceNumber: d.invoiceNumber || d.orderNumber,
        dealerName: d.dealerName,
        deliveryAddress: d.deliveryAddress,
        dealerCity: d.dealerCity,
        totalAmount: d.totalAmount,
        logisticsPartner: d.logisticsPartner,
        vehicleNumber: d.vehicleNumber,
        status: d.status,
        dispatchDate: d.dispatchDate,
      }));

    const delivered = dispatches
      .filter((d) => d.status === "DELIVERED")
      .map((d) => ({
        id: d._id?.toString(),
        dispatchNumber: d.dispatchNumber,
        type: d.invoiceId ? ("invoice" as const) : ("order" as const),
        referenceNumber: d.invoiceNumber || d.orderNumber,
        dealerName: d.dealerName,
        dealerCity: d.dealerCity,
        totalAmount: d.totalAmount,
        logisticsPartner: d.logisticsPartner,
        vehicleNumber: d.vehicleNumber,
        status: d.status,
        dispatchDate: d.dispatchDate,
        actualDeliveryDate: d.actualDeliveryDate,
      }));

    return res.json({
      pendingInvoices: invoicesReady,
      pendingOrders: ordersWithoutDispatch,
      activeDispatches,
      delivered,
      counts: {
        pendingInvoices: invoicesReady.length,
        pendingOrders: ordersWithoutDispatch.length,
        activeDispatches: activeDispatches.length,
        delivered: delivered.length,
      },
    });
  } catch (error) {
    console.error("Error fetching logistics queue:", error);
    return res.status(500).json({ error: "Failed to fetch logistics queue" });
  }
});

export default router;
