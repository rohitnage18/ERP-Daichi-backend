import { Router } from "express";
import {
  getDb,
  DailyReport,
  User,
  ObjectId,
} from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { dateKeyIST, dayEndIST, dayStartIST } from "../../lib/dates-ist";
import {
  ACTIVITY_EXISTS_MESSAGE,
  CLOSING_EXISTS_MESSAGE,
  MISSING_ACTIVITY_MESSAGE,
  validateActivity,
  validateClosing,
} from "../../lib/daily-reports";

const router = Router();

router.use(requireAuth);
router.use(requireRole("SALES_MARKETING", "MANAGEMENT_ADMIN"));

function actorName(req: { user?: { email?: string; name?: string } }) {
  return req.user?.name || req.user?.email || "";
}

function salespersonFilter(userId: string): Record<string, unknown> {
  if (ObjectId.isValid(userId)) {
    return { $or: [{ salespersonId: new ObjectId(userId) }, { salespersonId: userId }] };
  }
  return { salespersonId: userId };
}

function listFilter(req: { user?: { id: string; role: string }; query: Record<string, unknown> }) {
  const isAdmin = req.user!.role === "MANAGEMENT_ADMIN";
  const teamScope = isAdmin && req.query.scope === "team";
  if (teamScope) {
    const qUserId = req.query.userId;
    if (typeof qUserId === "string" && ObjectId.isValid(qUserId)) {
      return salespersonFilter(qUserId);
    }
    return {};
  }
  return salespersonFilter(req.user!.id);
}

function serialize(doc: DailyReport) {
  return {
    ...doc,
    id: doc._id?.toString(),
    salespersonId: doc.salespersonId?.toString(),
    hasActivity: Boolean(doc.activity),
    hasClosing: Boolean(doc.closing),
    salesTarget: doc.activity?.salesTarget ?? 0,
    salesAchievement: doc.closing?.salesAchievement ?? null,
    collectionTarget: doc.activity?.collectionTarget ?? 0,
    collectionAchievement: doc.closing?.collectionAchievement ?? null,
    plannedVisits: doc.activity?.placesToVisit?.length ?? 0,
    actualVisits: doc.closing?.placesVisited?.length ?? 0,
    flags: {
      closingWithoutActivity: Boolean(doc.closing && !doc.activity),
      missingActivity: !doc.activity,
      missingClosing: Boolean(doc.activity && !doc.closing),
    },
  };
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DailyReport>("dailyReports");
    const from = typeof req.query.from === "string" ? dayStartIST(req.query.from) : null;
    const to = typeof req.query.to === "string" ? dayEndIST(req.query.to) : null;
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(from.getTime())) range.$gte = from;
    if (to && !Number.isNaN(to.getTime())) range.$lte = to;
    const dateFilter = Object.keys(range).length ? { reportDate: range } : {};

    const rows = await col
      .find({ ...listFilter(req), ...dateFilter })
      .sort({ reportDate: -1 })
      .limit(500)
      .toArray();

    return res.json(rows.map(serialize));
  } catch (error) {
    console.error("Daily reports GET error:", error);
    return res.status(500).json({ error: "Failed to fetch daily reports" });
  }
});

router.get("/today", async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection<DailyReport>("dailyReports");
    const reportDate = dayStartIST(new Date());
    const existing = await col.findOne({
      ...salespersonFilter(req.user!.id),
      reportDate,
    });
    return res.json(existing ? serialize(existing) : { hasActivity: false, hasClosing: false, reportDate });
  } catch (error) {
    console.error("Daily reports today GET error:", error);
    return res.status(500).json({ error: "Failed to fetch today's report" });
  }
});

router.get("/summary", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const from = typeof req.query.from === "string" ? req.query.from : dateKeyIST();
    const to = typeof req.query.to === "string" ? req.query.to : from;
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";
    const zone = typeof req.query.zone === "string" ? req.query.zone.trim() : "";

    const usersCol = db.collection<User>("users");
    const salespeople = await usersCol
      .find(
        {
          role: "SALES_MARKETING",
          ...(zone ? { zoneName: zone } : {}),
          ...(userId && ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : {}),
        },
        { projection: { password: 0 } }
      )
      .toArray();

    const col = db.collection<DailyReport>("dailyReports");
    const reports = await col
      .find({
        reportDate: { $gte: dayStartIST(from), $lte: dayEndIST(to) },
        ...(userId && ObjectId.isValid(userId) ? salespersonFilter(userId) : {}),
      })
      .toArray();

    const byKey = new Map<string, DailyReport>();
    for (const r of reports) {
      byKey.set(`${r.salespersonId.toString()}|${dateKeyIST(r.reportDate)}`, r);
    }

    const days: string[] = [];
    for (
      let cursor = dayStartIST(from).getTime();
      cursor <= dayEndIST(to).getTime();
      cursor += 24 * 60 * 60 * 1000
    ) {
      days.push(dateKeyIST(new Date(cursor)));
    }

    const rows = [];
    for (const person of salespeople) {
      const pid = person._id!.toString();
      for (const day of days) {
        const report = byKey.get(`${pid}|${day}`);
        rows.push({
          salespersonId: pid,
          salespersonName: person.fullName || person.email,
          zoneName: person.zoneName || report?.zoneName || "",
          reportDate: day,
          hasActivity: Boolean(report?.activity),
          hasClosing: Boolean(report?.closing),
          activitySubmittedAt: report?.activity?.submittedAt || null,
          closingSubmittedAt: report?.closing?.submittedAt || null,
          salesTarget: report?.activity?.salesTarget ?? null,
          salesAchievement: report?.closing?.salesAchievement ?? null,
          collectionTarget: report?.activity?.collectionTarget ?? null,
          collectionAchievement: report?.closing?.collectionAchievement ?? null,
          plannedPlaces: report?.activity?.placesToVisit || [],
          actualPlaces: report?.closing?.placesVisited || [],
          missingActivity: !report?.activity,
          missingClosing: !report?.closing,
          closingWithoutActivity: Boolean(report?.closing && !report?.activity),
          lateActivity: false,
          report: report ? serialize(report) : null,
        });
      }
    }

    return res.json({ from, to, rows });
  } catch (error) {
    console.error("Daily reports summary GET error:", error);
    return res.status(500).json({ error: "Failed to build daily report summary" });
  }
});

router.post("/activity", async (req, res) => {
  try {
    const isAdmin = req.user!.role === "MANAGEMENT_ADMIN";
    const parsed = validateActivity(req.body || {}, { isAdmin });
    if (parsed.errors.length) {
      return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
    }

    const db = await getDb();
    const col = db.collection<DailyReport>("dailyReports");
    const existing = await col.findOne({
      ...salespersonFilter(req.user!.id),
      reportDate: parsed.reportDate!,
    });

    if (existing?.closing) {
      return res.status(409).json({ error: "Today's report is already closed and cannot be edited." });
    }

    const activity = {
      submittedAt: existing?.activity?.submittedAt || new Date(),
      ...parsed.data,
      openingOdometer: parsed.data.openingOdometer,
    };

    if (existing) {
      const updated = await col.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            activity,
            salespersonName: actorName(req),
            zoneName: req.user!.zoneName || existing.zoneName,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );
      return res.json({ ...serialize(updated!), updated: true });
    }

    const doc: DailyReport = {
      salespersonId: new ObjectId(req.user!.id),
      salespersonName: actorName(req),
      reportDate: parsed.reportDate!,
      zoneName: req.user!.zoneName || undefined,
      activity,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return res.status(201).json(serialize({ ...doc, _id: result.insertedId }));
  } catch (error) {
    const dup = error as { code?: number };
    if (dup.code === 11000) {
      return res.status(409).json({ error: ACTIVITY_EXISTS_MESSAGE });
    }
    console.error("Daily activity POST error:", error);
    return res.status(500).json({ error: "Failed to save Daily Activity Report" });
  }
});

router.post("/closing", async (req, res) => {
  try {
    const isAdmin = req.user!.role === "MANAGEMENT_ADMIN";
    const now = new Date();
    const dateRaw = req.body?.reportDate || now.toISOString();
    const key = dateKeyIST(dateRaw);
    if (!isAdmin && key !== dateKeyIST(now)) {
      return res.status(400).json({ error: "Report date must be today." });
    }
    const reportDate = dayStartIST(dateRaw);

    const db = await getDb();
    const col = db.collection<DailyReport>("dailyReports");
    const existing = await col.findOne({
      ...salespersonFilter(req.user!.id),
      reportDate,
    });

    if (!existing?.activity) {
      return res.status(400).json({ error: MISSING_ACTIVITY_MESSAGE });
    }
    if (existing.closing) {
      return res.status(409).json({ error: CLOSING_EXISTS_MESSAGE });
    }

    const parsed = validateClosing(req.body || {}, {
      openingOdometer: existing.activity.openingOdometer ?? null,
    });
    if (parsed.errors.length) {
      return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
    }

    const closing = {
      submittedAt: new Date(),
      ...parsed.data,
    };

    const updated = await col.findOneAndUpdate(
      { _id: existing._id, closing: { $exists: false } },
      { $set: { closing, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) {
      return res.status(409).json({ error: CLOSING_EXISTS_MESSAGE });
    }
    return res.status(201).json(serialize(updated));
  } catch (error) {
    console.error("Daily closing POST error:", error);
    return res.status(500).json({ error: "Failed to save Daily Closing Report" });
  }
});

export default router;
