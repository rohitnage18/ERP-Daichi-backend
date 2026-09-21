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
  makeReportCode,
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
    darId: doc.darId || null,
    dcrId: doc.dcrId || null,
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
    // Spec: DAR is locked after first submit (before field visits).
    if (existing?.activity) {
      return res.status(409).json({ error: ACTIVITY_EXISTS_MESSAGE });
    }

    const darId = makeReportCode("DAR", parsed.reportDate!, req.user!.id);
    const activity = {
      submittedAt: new Date(),
      ...parsed.data,
      openingOdometer: parsed.data.openingOdometer,
    };
    const activityApproval = {
      status: "SUBMITTED" as const,
    };

    if (existing) {
      const updated = await col.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            darId,
            activity,
            activityApproval,
            salespersonName: actorName(req),
            zoneName: req.user!.zoneName || existing.zoneName,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );
      return res.status(201).json(serialize(updated!));
    }

    const doc: DailyReport = {
      salespersonId: new ObjectId(req.user!.id),
      salespersonName: actorName(req),
      reportDate: parsed.reportDate!,
      zoneName: req.user!.zoneName || undefined,
      darId,
      activity,
      activityApproval,
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
    const dcrId = makeReportCode("DCR", reportDate, req.user!.id);
    const closingApproval = { status: "SUBMITTED" as const };

    const updated = await col.findOneAndUpdate(
      { _id: existing._id, closing: { $exists: false } },
      { $set: { closing, dcrId, closingApproval, updatedAt: new Date() } },
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

/** Sales Manager / Admin: approve or reject DAR or DCR section. */
router.post("/:id/approve", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const section = String(req.body?.section || "").toLowerCase();
    if (section !== "activity" && section !== "closing") {
      return res.status(400).json({ error: "section must be activity or closing" });
    }
    const decision = String(req.body?.status || "APPROVED").toUpperCase();
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "status must be APPROVED or REJECTED" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid report id" });
    }

    const db = await getDb();
    const col = db.collection<DailyReport>("dailyReports");
    const doc = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: "Report not found" });

    if (section === "activity" && !doc.activity) {
      return res.status(400).json({ error: "No DAR to approve" });
    }
    if (section === "closing" && !doc.closing) {
      return res.status(400).json({ error: "No DCR to approve" });
    }

    // Spec: salesperson cannot approve own reports (managers only; also block same user).
    if (doc.salespersonId?.toString() === req.user!.id) {
      return res.status(403).json({ error: "Cannot approve your own daily report" });
    }

    const approval = {
      status: decision as "APPROVED" | "REJECTED",
      byId: new ObjectId(req.user!.id),
      byName: actorName(req),
      at: new Date(),
      note: typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : undefined,
    };
    const field = section === "activity" ? "activityApproval" : "closingApproval";
    const updated = await col.findOneAndUpdate(
      { _id: doc._id },
      { $set: { [field]: approval, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    return res.json(serialize(updated!));
  } catch (error) {
    console.error("Daily report approve error:", error);
    return res.status(500).json({ error: "Failed to approve daily report" });
  }
});

export default router;
