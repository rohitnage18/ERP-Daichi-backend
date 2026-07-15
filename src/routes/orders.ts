import { Router } from "express";
import prisma from "../lib/prisma";
import { generateOrderNumber } from "../lib/utils";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const forLogistics = req.query.forLogistics as string | undefined;

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (forLogistics === "true") {
      where.status = { in: ["APPROVED", "PROCESSING", "DISPATCHED", "IN_TRANSIT", "DELIVERED"] };
    }

    if (req.user!.role === "SALES_MARKETING" && req.user!.zoneId) {
      where.dealer = { district: { zoneId: req.user!.zoneId } };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        dealer: {
          select: {
            firmName: true,
            city: true,
            businessAddress: true,
          },
        },
        createdBy: {
          select: { fullName: true },
        },
        dispatch: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { items, ...orderData } = req.body;

    const orderCount = await prisma.order.count();
    const orderNumber = generateOrderNumber(orderCount + 1);

    const order = await prisma.order.create({
      data: {
        ...orderData,
        orderNumber,
        createdById: req.user!.id,
        items: {
          create: items,
        },
      },
      include: {
        items: true,
      },
    });

    return res.status(201).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        dealer: {
          select: {
            firmName: true,
            dealerCode: true,
            city: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                productCode: true,
                name: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: {
          select: { fullName: true },
        },
        approvedBy: {
          select: { fullName: true },
        },
        dispatch: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    return res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    if (req.user!.role !== "MANAGEMENT_ADMIN") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const updatedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: "APPROVED",
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    return res.json(updatedOrder);
  } catch (error) {
    console.error("Error approving order:", error);
    return res.status(500).json({ error: "Failed to approve order" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    if (req.user!.role !== "MANAGEMENT_ADMIN") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
      },
    });

    return res.json(updatedOrder);
  } catch (error) {
    console.error("Error rejecting order:", error);
    return res.status(500).json({ error: "Failed to reject order" });
  }
});

export default router;
