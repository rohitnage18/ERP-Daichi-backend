import { Router } from "express";
import prisma from "../lib/prisma";
import { generateDispatchNumber } from "../lib/utils";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const dispatches = await prisma.dispatch.findMany({
      include: {
        order: {
          include: {
            dealer: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(dispatches);
  } catch (error) {
    console.error("Error fetching dispatches:", error);
    return res.status(500).json({ error: "Failed to fetch dispatches" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;

    const dispatchCount = await prisma.dispatch.count();
    const dispatchNumber = generateDispatchNumber(dispatchCount + 1);

    const dispatch = await prisma.dispatch.create({
      data: {
        ...data,
        dispatchNumber,
        status: "PENDING",
        dispatchDate: new Date(),
      },
    });

    await prisma.order.update({
      where: { id: data.orderId },
      data: { status: "PROCESSING" },
    });

    return res.status(201).json(dispatch);
  } catch (error) {
    console.error("Error creating dispatch:", error);
    return res.status(500).json({ error: "Failed to create dispatch" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const updateData: Record<string, unknown> = { status };

    if (status === "DELIVERED") {
      updateData.actualDeliveryDate = new Date();
    }

    const dispatch = await prisma.dispatch.update({
      where: { id: req.params.id },
      data: updateData,
    });

    const orderStatus =
      status === "DELIVERED"
        ? "DELIVERED"
        : status === "DISPATCHED" || status === "IN_TRANSIT"
          ? "DISPATCHED"
          : "PROCESSING";

    await prisma.order.update({
      where: { id: dispatch.orderId },
      data: { status: orderStatus },
    });

    return res.json(dispatch);
  } catch (error) {
    console.error("Error updating dispatch status:", error);
    return res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
