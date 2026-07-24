import { Router } from "express";
import { Db } from "mongodb";
import { getDb, Dispatch, Invoice, Order, ObjectId } from "../../lib/mongodb";
import { generateDispatchNumber } from "../../lib/utils";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

/**
 * Deduct dispatched quantities from inventory. Best-effort: never throws so a
 * stock hiccup cannot block a dispatch.
 */
async function deductInventory(
  db: Db,
  items: { productId: ObjectId; quantity: number }[]
): Promise<void> {
  try {
    const now = new Date();
    const ops = items
      .filter((item) => item?.productId && item.quantity)
      .map((item) => ({
        updateOne: {
          filter: { productId: item.productId },
          update: {
            $inc: { quantity: -Math.abs(Number(item.quantity)) },
            $set: { lastUpdated: now },
          },
        },
      }));
    if (ops.length > 0) {
      await db.collection("inventoryItems").bulkWrite(ops, { ordered: false });
    }
  } catch (error) {
    console.error("Inventory deduction failed (non-fatal):", error);
  }
}

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const dispatchesCol = db.collection<Dispatch>("dispatches");

    const dispatches = await dispatchesCol
      .find({})
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();

    return res.json(
      dispatches.map((d) => ({
        ...d,
        id: d._id?.toString(),
      }))
    );
  } catch (error) {
    console.error("Error fetching dispatches:", error);
    return res.status(500).json({ error: "Failed to fetch dispatches" });
  }
});

router.post("/", requireRole("MANAGEMENT_ADMIN", "PRODUCTION_LOGISTICS"), async (req, res) => {
  try {
    const db = await getDb();
    const dispatchesCol = db.collection<Dispatch>("dispatches");
    const ordersCol = db.collection<Order>("orders");
    const invoicesCol = db.collection<Invoice>("invoices");

    const { orderId, invoiceId, logisticsPartner, vehicleNumber, driverName, driverContact } =
      req.body;

    if (!orderId && !invoiceId) {
      return res.status(400).json({ error: "Order ID or Invoice ID is required" });
    }
    if (!logisticsPartner?.trim()) {
      return res.status(400).json({ error: "Logistics partner is required" });
    }
    if (!vehicleNumber?.trim()) {
      return res.status(400).json({ error: "Vehicle number is required" });
    }

    let dispatchPayload: Omit<Dispatch, "_id">;

    if (invoiceId) {
      if (!ObjectId.isValid(invoiceId)) {
        return res.status(400).json({ error: "Invalid invoice ID" });
      }

      const invoice = await invoicesCol.findOne({ _id: new ObjectId(invoiceId) });
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const existing = await dispatchesCol.findOne({ invoiceId: new ObjectId(invoiceId) });
      if (existing) {
        return res.status(400).json({ error: "Dispatch already exists for this invoice" });
      }

      const count = await dispatchesCol.countDocuments();
      dispatchPayload = {
        dispatchNumber: generateDispatchNumber(count + 1),
        invoiceId: new ObjectId(invoiceId),
        invoiceNumber: invoice.invoiceNumber,
        dealerName: invoice.dealerName,
        deliveryAddress: invoice.shippingAddress || invoice.dealerAddress,
        dealerCity: invoice.dealerCity || invoice.shippingCity,
        totalAmount: invoice.totalAmount,
        logisticsPartner: logisticsPartner.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        driverName: driverName?.trim() || undefined,
        driverContact: driverContact?.trim() || undefined,
        status: "PENDING",
        dispatchDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await dispatchesCol.insertOne(dispatchPayload);

      await invoicesCol.updateOne(
        { _id: new ObjectId(invoiceId) },
        {
          $set: {
            logisticsStatus: "PROCESSING",
            dispatchId: result.insertedId,
            updatedAt: new Date(),
          },
        }
      );

      await deductInventory(
        db,
        (invoice.items || []).map((it) => ({ productId: it.productId, quantity: it.quantity }))
      );

      return res.status(201).json({
        ...dispatchPayload,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    }

    if (!ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: "Valid order ID is required" });
    }

    const order = await ordersCol.findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const existing = await dispatchesCol.findOne({ orderId: new ObjectId(orderId) });
    if (existing) {
      return res.status(400).json({ error: "Dispatch already exists for this order" });
    }

    const count = await dispatchesCol.countDocuments();
    dispatchPayload = {
      dispatchNumber: generateDispatchNumber(count + 1),
      orderId: new ObjectId(orderId),
      orderNumber: order.orderNumber,
      dealerName: order.dealerName,
      deliveryAddress: order.deliveryAddress,
      dealerCity: order.dealerCity,
      totalAmount: order.totalAmount,
      logisticsPartner: logisticsPartner.trim(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      driverName: driverName?.trim() || undefined,
      driverContact: driverContact?.trim() || undefined,
      status: "PENDING",
      dispatchDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await dispatchesCol.insertOne(dispatchPayload);

    await ordersCol.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status: "PROCESSING", updatedAt: new Date() } }
    );

    await deductInventory(
      db,
      (order.items || []).map((it) => ({ productId: it.productId, quantity: it.quantity }))
    );

    return res.status(201).json({
      ...dispatchPayload,
      id: result.insertedId.toString(),
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating dispatch:", error);
    return res.status(500).json({ error: "Failed to create dispatch" });
  }
});

router.patch("/:id/status", requireRole("MANAGEMENT_ADMIN", "PRODUCTION_LOGISTICS"), async (req, res) => {
  try {
    const db = await getDb();
    const dispatchesCol = db.collection<Dispatch>("dispatches");
    const ordersCol = db.collection<Order>("orders");
    const invoicesCol = db.collection<Invoice>("invoices");

    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["PENDING", "PACKED", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid dispatch status" });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid dispatch ID" });
    }

    const updateData: Partial<Dispatch> = {
      status,
      updatedAt: new Date(),
    };

    if (status === "DELIVERED") {
      updateData.actualDeliveryDate = new Date();
    }

    const result = await dispatchesCol.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Dispatch not found" });
    }

    const orderStatus =
      status === "DELIVERED"
        ? "DELIVERED"
        : status === "DISPATCHED" || status === "IN_TRANSIT" || status === "OUT_FOR_DELIVERY"
          ? "DISPATCHED"
          : "PROCESSING";

    const invoiceLogisticsStatus =
      status === "DELIVERED"
        ? "DELIVERED"
        : status === "DISPATCHED" || status === "IN_TRANSIT" || status === "OUT_FOR_DELIVERY"
          ? "DISPATCHED"
          : "PROCESSING";

    if (result.orderId) {
      await ordersCol.updateOne(
        { _id: result.orderId },
        { $set: { status: orderStatus, updatedAt: new Date() } }
      );
    }

    if (result.invoiceId) {
      await invoicesCol.updateOne(
        { _id: result.invoiceId },
        { $set: { logisticsStatus: invoiceLogisticsStatus, updatedAt: new Date() } }
      );
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
    });
  } catch (error) {
    console.error("Error updating dispatch status:", error);
    return res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
