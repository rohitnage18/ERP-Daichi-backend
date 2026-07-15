import { Router } from "express";
import { getDb, Order, Product, Dispatch, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { findDealerById } from "../../lib/dealer-lookup";

const router = Router();

router.use(requireAuth);

async function generateOrderNumber(): Promise<string> {
  const db = await getDb();
  const ordersCol = db.collection<Order>("orders");

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `DI/ORD/${year}-${month}/`;

  const lastOrder = await ordersCol
    .find({ orderNumber: { $regex: `^${prefix.replace(/\//g, "\\/")}` } })
    .sort({ orderNumber: -1 })
    .limit(1)
    .toArray();

  let seq = 1;
  if (lastOrder.length > 0) {
    const lastNum = lastOrder[0].orderNumber.split("/").pop() || "0";
    seq = parseInt(lastNum, 10) + 1;
  }

  return `${prefix}${String(seq).padStart(5, "0")}`;
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const ordersCol = db.collection<Order>("orders");
    const dispatchesCol = db.collection<Dispatch>("dispatches");

    const { status, dealerId, q, forLogistics } = req.query;

    const filter: Record<string, unknown> = {};

    if (forLogistics === "true") {
      filter.status = { $in: ["APPROVED", "PROCESSING", "DISPATCHED", "DELIVERED"] };
    } else if (status && status !== "all") {
      filter.status = status;
    }

    if (dealerId && ObjectId.isValid(dealerId as string)) {
      filter.dealerId = new ObjectId(dealerId as string);
    }

    if (q) {
      filter.$or = [
        { orderNumber: { $regex: q, $options: "i" } },
        { dealerName: { $regex: q, $options: "i" } },
      ];
    }

    const orders = await ordersCol.find(filter).sort({ createdAt: -1 }).limit(500).toArray();

    const orderIds = orders.map((o) => o._id!);
    const dispatches = orderIds.length
      ? await dispatchesCol.find({ orderId: { $in: orderIds } }).toArray()
      : [];
    const dispatchMap = new Map(
      dispatches.filter((d) => d.orderId).map((d) => [d.orderId!.toString(), d])
    );

    return res.json(
      orders.map((o) => {
        const dispatch = dispatchMap.get(o._id!.toString());
        return {
          ...o,
          id: o._id?.toString(),
          dealer: {
            id: o.dealerId?.toString(),
            firmName: o.dealerName,
            city: o.dealerCity,
            businessAddress: o.deliveryAddress,
          },
          dispatch: dispatch
            ? {
                id: dispatch._id?.toString(),
                dispatchNumber: dispatch.dispatchNumber,
                status: dispatch.status,
                logisticsPartner: dispatch.logisticsPartner,
                vehicleNumber: dispatch.vehicleNumber,
              }
            : undefined,
        };
      })
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const ordersCol = db.collection<Order>("orders");
    const dispatchesCol = db.collection<Dispatch>("dispatches");

    const { id } = req.params;

    let order;

    if (ObjectId.isValid(id)) {
      order = await ordersCol.findOne({ _id: new ObjectId(id) });
    }

    if (!order) {
      order = await ordersCol.findOne({ orderNumber: id });
    }

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const dispatch = await dispatchesCol.findOne({ orderId: order._id! });

    return res.json({
      ...order,
      id: order._id?.toString(),
      dealer: {
        id: order.dealerId?.toString(),
        firmName: order.dealerName,
        city: order.dealerCity,
      },
      dispatch: dispatch
        ? {
            id: dispatch._id?.toString(),
            dispatchNumber: dispatch.dispatchNumber,
            status: dispatch.status,
            logisticsPartner: dispatch.logisticsPartner,
            vehicleNumber: dispatch.vehicleNumber,
          }
        : null,
      items: order.items.map((item) => ({
        ...item,
        id: item.productId?.toString(),
        product: {
          id: item.productId?.toString(),
          name: item.productName,
          productCode: item.productCode,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.post(
  "/",
  requireRole("SALES_MARKETING", "MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const ordersCol = db.collection<Order>("orders");
      const productsCol = db.collection<Product>("products");

      const {
        dealerId,
        items,
        deliveryAddress,
        requestedDeliveryDate,
        specialInstructions,
        status,
      } = req.body;

      if (!dealerId || !items || items.length === 0) {
        return res.status(400).json({ error: "Dealer and items are required" });
      }

      const dealer = await findDealerById(dealerId);
      if (!dealer) {
        return res.status(404).json({ error: "Dealer not found" });
      }

      const productIds = items
        .map((i: { productId: string }) => i.productId)
        .filter((id: string) => ObjectId.isValid(id))
        .map((id: string) => new ObjectId(id));

      if (productIds.length !== items.length) {
        return res.status(400).json({ error: "Invalid product ID in items" });
      }

      const products = await productsCol.find({ _id: { $in: productIds } }).toArray();
      const productMap = new Map(products.map((p) => [p._id!.toString(), p]));

      let subtotal = 0;
      let taxAmount = 0;

      const orderItems = items.map(
        (item: { productId: string; quantity: number; unitPrice?: number; gstRate?: number }) => {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }

          const qty = Number(item.quantity);
          if (!qty || qty <= 0) {
            throw new Error(`Invalid quantity for product ${product.name}`);
          }

          const price = item.unitPrice ?? product.basePrice;
          const gstRate = item.gstRate ?? product.gstRate;
          const tax = (qty * price * gstRate) / 100;
          const total = qty * price + tax;

          subtotal += qty * price;
          taxAmount += tax;

          return {
            productId: new ObjectId(item.productId),
            productName: product.name,
            productCode: product.productCode,
            quantity: qty,
            unitPrice: price,
            gstRate,
            taxAmount: tax,
            totalAmount: total,
          };
        }
      );

      const orderNumber = await generateOrderNumber();
      const orderStatus =
        status === "DRAFT" ? "DRAFT" : ("PENDING_APPROVAL" as Order["status"]);

      const order: Order = {
        orderNumber,
        orderDate: new Date(),
        dealerId: dealer._id,
        dealerName: dealer.firmName,
        dealerCity: dealer.city,
        deliveryAddress:
          deliveryAddress ||
          dealer.businessAddress ||
          `${dealer.businessAddress}, ${dealer.city}`,
        requestedDeliveryDate: requestedDeliveryDate
          ? new Date(requestedDeliveryDate)
          : undefined,
        specialInstructions,
        items: orderItems,
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        status: orderStatus,
        createdById: new ObjectId(req.user!.id),
        createdByName: req.user!.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await ordersCol.insertOne(order);

      return res.status(201).json({
        ...order,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating order:", error);
      const message = error instanceof Error ? error.message : "Failed to create order";
      return res.status(500).json({ error: message });
    }
  }
);

router.post(
  "/:id/approve",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const ordersCol = db.collection<Order>("orders");

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const result = await ordersCol.findOneAndUpdate(
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
        return res.status(404).json({ error: "Order not found or not pending approval" });
      }

      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error approving order:", error);
      return res.status(500).json({ error: "Failed to approve order" });
    }
  }
);

router.post(
  "/:id/reject",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const ordersCol = db.collection<Order>("orders");

      const { id } = req.params;
      const { reason } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const result = await ordersCol.findOneAndUpdate(
        { _id: new ObjectId(id), status: "PENDING_APPROVAL" },
        {
          $set: {
            status: "CANCELLED",
            rejectionReason: reason || "Rejected by admin",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      if (!result) {
        return res.status(404).json({ error: "Order not found or not pending approval" });
      }

      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error rejecting order:", error);
      return res.status(500).json({ error: "Failed to reject order" });
    }
  }
);

export default router;
