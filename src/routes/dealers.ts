import { Router } from "express";
import prisma from "../lib/prisma";
import { generateDealerCode } from "../lib/utils";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    if (req.user!.role === "SALES_MARKETING" && req.user!.zoneId) {
      where.district = { zoneId: req.user!.zoneId };
    }

    const dealers = await prisma.dealer.findMany({
      where,
      include: {
        district: {
          include: {
            zone: true,
          },
        },
        createdBy: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(dealers);
  } catch (error) {
    console.error("Error fetching dealers:", error);
    return res.status(500).json({ error: "Failed to fetch dealers" });
  }
});

router.post("/", async (req, res) => {
  try {
    const dealer = await prisma.dealer.create({
      data: {
        ...req.body,
        createdById: req.user!.id,
      },
    });

    return res.status(201).json(dealer);
  } catch (error) {
    console.error("Error creating dealer:", error);
    return res.status(500).json({ error: "Failed to create dealer" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const dealer = await prisma.dealer.findUnique({
      where: { id: req.params.id },
      include: {
        district: {
          include: {
            zone: true,
          },
        },
        createdBy: {
          select: { fullName: true },
        },
        approvedBy: {
          select: { fullName: true },
        },
      },
    });

    if (!dealer) {
      return res.status(404).json({ error: "Dealer not found" });
    }

    return res.json(dealer);
  } catch (error) {
    console.error("Error fetching dealer:", error);
    return res.status(500).json({ error: "Failed to fetch dealer" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const dealer = await prisma.dealer.update({
      where: { id: req.params.id },
      data: req.body,
    });

    return res.json(dealer);
  } catch (error) {
    console.error("Error updating dealer:", error);
    return res.status(500).json({ error: "Failed to update dealer" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    if (req.user!.role !== "MANAGEMENT_ADMIN") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const dealer = await prisma.dealer.findUnique({
      where: { id: req.params.id },
      include: { district: true },
    });

    if (!dealer) {
      return res.status(404).json({ error: "Dealer not found" });
    }

    const dealerCount = await prisma.dealer.count({
      where: { districtId: dealer.districtId, dealerCode: { not: null } },
    });

    const dealerCode = generateDealerCode(dealer.district.code, dealerCount + 1);

    const updatedDealer = await prisma.dealer.update({
      where: { id: req.params.id },
      data: {
        status: "APPROVED",
        dealerCode,
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    return res.json(updatedDealer);
  } catch (error) {
    console.error("Error approving dealer:", error);
    return res.status(500).json({ error: "Failed to approve dealer" });
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

    const updatedDealer = await prisma.dealer.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
      },
    });

    return res.json(updatedDealer);
  } catch (error) {
    console.error("Error rejecting dealer:", error);
    return res.status(500).json({ error: "Failed to reject dealer" });
  }
});

export default router;
