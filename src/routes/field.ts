import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

function dayOnly(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get("/visits", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: Record<string, unknown> = {};

    if (req.user!.role === "SALES_MARKETING") {
      where.userId = req.user!.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (from || to) {
      where.visitDate = {};
      if (from) (where.visitDate as Record<string, Date>).gte = new Date(from);
      if (to) (where.visitDate as Record<string, Date>).lte = new Date(to);
    }

    const visits = await prisma.salesVisit.findMany({
      where,
      include: {
        dealer: { select: { firmName: true, city: true } },
        user: { select: { fullName: true, employeeId: true } },
      },
      orderBy: { visitDate: "desc" },
      take: 200,
    });

    return res.json(visits);
  } catch (e) {
    console.error("Visits GET error:", e);
    return res.status(500).json({ error: "Failed to fetch visits" });
  }
});

router.post("/visits", async (req, res) => {
  try {
    const data = req.body;
    const visit = await prisma.salesVisit.create({
      data: {
        visitDate: new Date(data.visitDate || Date.now()),
        dealerId: data.dealerId || null,
        prospectName: data.prospectName || null,
        purpose: data.purpose,
        personsMet: data.personsMet,
        discussionNotes: data.discussionNotes,
        nextAction: data.nextAction || null,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        locationLabel: data.locationLabel || null,
        userId: req.user!.id,
      },
      include: {
        dealer: { select: { firmName: true } },
      },
    });

    if (data.latitude != null && data.longitude != null) {
      await prisma.locationTrack.create({
        data: {
          userId: req.user!.id,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy ?? null,
          source: "VISIT_CHECKIN",
          visitId: visit.id,
          addressLabel: data.locationLabel || null,
        },
      });
    }

    return res.status(201).json(visit);
  } catch (e) {
    console.error("Visits POST error:", e);
    return res.status(500).json({ error: "Failed to create visit" });
  }
});

router.get("/daily-logs", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;

    const where: Record<string, unknown> = {};
    if (req.user!.role === "SALES_MARKETING") {
      where.userId = req.user!.id;
    } else if (userId) {
      where.userId = userId;
    }

    const logs = await prisma.dailyLog.findMany({
      where,
      include: { user: { select: { fullName: true, employeeId: true } } },
      orderBy: { logDate: "desc" },
      take: 100,
    });

    return res.json(logs);
  } catch (e) {
    console.error("Daily logs GET error:", e);
    return res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.post("/daily-logs", async (req, res) => {
  try {
    const data = req.body;
    const logDate = dayOnly(new Date(data.logDate || Date.now()));

    const log = await prisma.dailyLog.upsert({
      where: {
        userId_logDate: {
          userId: req.user!.id,
          logDate,
        },
      },
      create: {
        logDate,
        userId: req.user!.id,
        dayStartTime: data.dayStartTime ? new Date(data.dayStartTime) : null,
        dayEndTime: data.dayEndTime ? new Date(data.dayEndTime) : null,
        summary: data.summary,
        dealersVisited: data.dealersVisited ?? 0,
        ordersDiscussed: data.ordersDiscussed ?? 0,
        kilometersTraveled: data.kilometersTraveled ?? null,
        expensesSummary: data.expensesSummary || null,
        status: "SUBMITTED",
      },
      update: {
        dayStartTime: data.dayStartTime ? new Date(data.dayStartTime) : undefined,
        dayEndTime: data.dayEndTime ? new Date(data.dayEndTime) : undefined,
        summary: data.summary,
        dealersVisited: data.dealersVisited ?? 0,
        ordersDiscussed: data.ordersDiscussed ?? 0,
        kilometersTraveled: data.kilometersTraveled ?? null,
        expensesSummary: data.expensesSummary || null,
        status: "SUBMITTED",
      },
    });

    return res.status(201).json(log);
  } catch (e) {
    console.error("Daily logs POST error:", e);
    return res.status(500).json({ error: "Failed to save daily log" });
  }
});

router.get("/location", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const date = req.query.date as string | undefined;

    const where: Record<string, unknown> = {};

    if (req.user!.role === "SALES_MARKETING") {
      where.userId = req.user!.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (date) {
      const d = new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      where.recordedAt = { gte: start, lte: end };
    }

    const tracks = await prisma.locationTrack.findMany({
      where,
      include: {
        user: { select: { fullName: true, employeeId: true } },
        visit: { select: { purpose: true, dealer: { select: { firmName: true } } } },
      },
      orderBy: { recordedAt: "asc" },
      take: 500,
    });

    return res.json(tracks);
  } catch (e) {
    console.error("Location GET error:", e);
    return res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.post("/location", async (req, res) => {
  try {
    const data = req.body;

    const track = await prisma.locationTrack.create({
      data: {
        userId: req.user!.id,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? null,
        source: data.source || "MANUAL",
        visitId: data.visitId || null,
        addressLabel: data.addressLabel || null,
      },
    });

    return res.status(201).json(track);
  } catch (e) {
    console.error("Location POST error:", e);
    return res.status(500).json({ error: "Failed to record location" });
  }
});

router.get("/allowances", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const where: Record<string, unknown> = {};

    if (req.user!.role === "SALES_MARKETING") {
      where.userId = req.user!.id;
    }
    if (status) where.status = status;

    const claims = await prisma.allowanceClaim.findMany({
      where,
      include: {
        user: { select: { fullName: true, employeeId: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { claimDate: "desc" },
      take: 200,
    });

    return res.json(claims);
  } catch (e) {
    console.error("Allowances GET error:", e);
    return res.status(500).json({ error: "Failed to fetch allowances" });
  }
});

router.post("/allowances", async (req, res) => {
  try {
    const data = req.body;
    const claim = await prisma.allowanceClaim.create({
      data: {
        claimDate: new Date(data.claimDate || Date.now()),
        userId: req.user!.id,
        claimType: data.claimType,
        amount: data.amount,
        description: data.description,
        kilometers: data.kilometers ?? null,
        receiptNote: data.receiptNote || null,
        status: "PENDING",
      },
    });

    return res.status(201).json(claim);
  } catch (e) {
    console.error("Allowances POST error:", e);
    return res.status(500).json({ error: "Failed to submit claim" });
  }
});

router.patch("/allowances", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const data = req.body;
    const { id, status, rejectionReason } = data;

    const claim = await prisma.allowanceClaim.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === "REJECTED" ? rejectionReason : null,
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    return res.json(claim);
  } catch (e) {
    console.error("Allowances PATCH error:", e);
    return res.status(500).json({ error: "Failed to update claim" });
  }
});

export default router;
