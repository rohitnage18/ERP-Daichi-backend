import { Router } from "express";
import { getDb, DailyLog, SalesVisit, LocationTrack, TrackingSession, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { canAcceptLivePing, isLocationAnomaly, isValidCoord } from "../../lib/tracking";
import { dateKeyIST, dayEndIST, dayStartIST } from "../../lib/dates-ist";

const router = Router();

router.use((req, res, next) => {
  if (req.path.startsWith("/public")) return next("router");
  return requireAuth(req, res, next);
});
router.use(requireRole("SALES_MARKETING", "MANAGEMENT_ADMIN"));

function dayOnly(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Match records saved with ObjectId or string userId. */
function userIdFilter(userId: string): Record<string, unknown> {
  if (ObjectId.isValid(userId)) {
    return { $or: [{ userId: new ObjectId(userId) }, { userId }] };
  }
  return { userId };
}

function actorName(req: { user?: { email?: string; name?: string } }) {
  return req.user?.name || req.user?.email || "";
}

function dateRange(query: { from?: unknown; to?: unknown }, field: string): Record<string, unknown> {
  const from = typeof query.from === "string" ? new Date(query.from) : null;
  const to = typeof query.to === "string" ? new Date(query.to) : null;
  const range: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lte = to;
  return Object.keys(range).length ? { [field]: range } : {};
}

function listFilter(req: { user?: { id: string; role: string }; query: Record<string, unknown> }) {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === "MANAGEMENT_ADMIN";
  const teamScope = isAdmin && req.query.scope === "team";
  if (teamScope) {
    const qUserId = req.query.userId;
    if (typeof qUserId === "string" && ObjectId.isValid(qUserId)) {
      return userIdFilter(qUserId);
    }
    return {};
  }
  return userIdFilter(userId);
}

async function recordGpsTrack(
  userId: string,
  userName: string,
  data: { latitude?: number; longitude?: number; accuracy?: number; locationLabel?: string },
  source: string,
  visitId?: import("mongodb").ObjectId
) {
  if (data.latitude == null || data.longitude == null) return;
  const db = await getDb();
  const tracksCol = db.collection<LocationTrack>("locationTracks");
  await tracksCol.insertOne({
    userId: new ObjectId(userId),
    userName,
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    accuracy: data.accuracy ?? undefined,
    source,
    visitId,
    addressLabel: data.locationLabel || undefined,
    recordedAt: new Date(),
  });
}

router.get("/visits", async (req, res) => {
  try {
    const db = await getDb();
    const visitsCol = db.collection<SalesVisit>("salesVisits");

    const visits = await visitsCol
      .find({ ...listFilter(req), ...dateRange(req.query, "visitDate") })
      .sort({ visitDate: -1 })
      .limit(200)
      .toArray();

    return res.json(
      visits.map((v) => ({
        ...v,
        id: v._id?.toString(),
        dealer: v.dealerName ? { firmName: v.dealerName } : undefined,
        user: { fullName: v.userName },
      }))
    );
  } catch (error) {
    console.error("Visits GET error:", error);
    return res.status(500).json({ error: "Failed to fetch visits" });
  }
});

router.post("/visits", async (req, res) => {
  try {
    const db = await getDb();
    const visitsCol = db.collection<SalesVisit>("salesVisits");
    const data = req.body;

    const visit: SalesVisit = {
      visitDate: new Date(data.visitDate || Date.now()),
      userId: new ObjectId(req.user!.id),
      userName: actorName(req),
      dealerId: data.dealerId && ObjectId.isValid(data.dealerId) ? new ObjectId(data.dealerId) : undefined,
      dealerName: data.dealerName || undefined,
      prospectName: data.prospectName || undefined,
      purpose: data.purpose,
      personsMet: data.personsMet,
      discussionNotes: data.discussionNotes,
      nextAction: data.nextAction || undefined,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      locationLabel: data.locationLabel || undefined,
      odometerPhoto: data.odometerPhoto || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await visitsCol.insertOne(visit);

    if (data.latitude != null && data.longitude != null) {
      const tracksCol = db.collection<LocationTrack>("locationTracks");
      await tracksCol.insertOne({
        userId: new ObjectId(req.user!.id),
        userName: actorName(req),
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? undefined,
        source: "VISIT_CHECKIN",
        visitId: result.insertedId,
        addressLabel: data.locationLabel || undefined,
        recordedAt: new Date(),
      });
    }

    return res.status(201).json({
      ...visit,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Visits POST error:", error);
    return res.status(500).json({ error: "Failed to create visit" });
  }
});

router.get("/daily-logs", async (req, res) => {
  try {
    const db = await getDb();
    const logsCol = db.collection<DailyLog>("dailyLogs");

    const logs = await logsCol
      .find({ ...listFilter(req), ...dateRange(req.query, "logDate") })
      .sort({ logDate: -1 })
      .limit(100)
      .toArray();

    return res.json(
      logs.map((l) => ({
        ...l,
        id: l._id?.toString(),
        user: { fullName: l.userName },
      }))
    );
  } catch (error) {
    console.error("Daily logs GET error:", error);
    return res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.post("/daily-logs", async (req, res) => {
  try {
    const db = await getDb();
    const logsCol = db.collection<DailyLog>("dailyLogs");
    const data = req.body;
    const logDate = dayOnly(new Date(data.logDate || Date.now()));

    const existing = await logsCol.findOne({
      ...userIdFilter(req.user!.id),
      logDate,
    });

    const logData: Partial<DailyLog> = {
      logDate,
      userId: new ObjectId(req.user!.id),
      userName: actorName(req),
      dayStartTime: data.dayStartTime ? new Date(data.dayStartTime) : undefined,
      dayEndTime: data.dayEndTime ? new Date(data.dayEndTime) : undefined,
      summary: data.summary,
      dealersVisited: data.dealersVisited ?? 0,
      ordersDiscussed: data.ordersDiscussed ?? 0,
      openingKm: data.openingKm ?? undefined,
      closingKm: data.closingKm ?? undefined,
      kilometersTraveled:
        data.openingKm != null && data.closingKm != null
          ? Math.max(0, Number(data.closingKm) - Number(data.openingKm))
          : data.kilometersTraveled ?? undefined,
      salesAmount: data.salesAmount ?? undefined,
      collectionAmount: data.collectionAmount ?? undefined,
      newDealersAppointed: data.newDealersAppointed ?? undefined,
      achievementNotes: data.achievementNotes || undefined,
      expensesSummary: data.expensesSummary || undefined,
      odometerPhoto: data.odometerPhoto || undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      locationLabel: data.locationLabel || undefined,
      status: "SUBMITTED",
      updatedAt: new Date(),
    };

    let result;
    if (existing) {
      result = await logsCol.findOneAndUpdate(
        { _id: existing._id },
        { $set: logData },
        { returnDocument: "after" }
      );
    } else {
      const newLog: DailyLog = {
        ...(logData as DailyLog),
        createdAt: new Date(),
      };
      const insertResult = await logsCol.insertOne(newLog);
      result = { ...newLog, _id: insertResult.insertedId };
    }

    await recordGpsTrack(req.user!.id, actorName(req), data, "DAILY_LOG");

    return res.status(201).json({
      ...result,
      id: result?._id?.toString(),
    });
  } catch (error) {
    console.error("Daily logs POST error:", error);
    return res.status(500).json({ error: "Failed to save daily log" });
  }
});

router.get("/allowances", (_req, res) => {
  return res.status(404).json({ error: "Allowance claims have been removed from the Sales module" });
});

router.post("/allowances", (_req, res) => {
  return res.status(404).json({ error: "Allowance claims have been removed from the Sales module" });
});

router.patch("/allowances", (_req, res) => {
  return res.status(404).json({ error: "Allowance claims have been removed from the Sales module" });
});

router.get("/location/live", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const tracksCol = db.collection<LocationTrack>("locationTracks");
    const sessionsCol = db.collection<TrackingSession>("trackingSessions");
    const from = dayStartIST(typeof req.query.date === "string" ? req.query.date : new Date());
    const to = dayEndIST(from);

    const tracks = await tracksCol
      .find({ recordedAt: { $gte: from, $lte: to } })
      .sort({ recordedAt: -1 })
      .toArray();

    const latest = new Map<string, LocationTrack>();
    for (const track of tracks) {
      const key = track.userId.toString();
      if (!latest.has(key)) latest.set(key, track);
    }

    const sessions = await sessionsCol.find({ active: true }).toArray();
    const sessionByUser = new Map(sessions.map((s) => [s.userId.toString(), s]));
    const now = new Date();

    return res.json(
      [...latest.values()].map((t) => ({
        ...t,
        id: t._id?.toString(),
        userId: t.userId.toString(),
        trackingActive: Boolean(sessionByUser.get(t.userId.toString())?.active),
        anomaly: isLocationAnomaly(t.recordedAt, now),
      }))
    );
  } catch (error) {
    console.error("Location live GET error:", error);
    return res.status(500).json({ error: "Failed to fetch live locations" });
  }
});

router.get("/location/trail", async (req, res) => {
  try {
    const isAdmin = req.user!.role === "MANAGEMENT_ADMIN";
    const qUserId = typeof req.query.userId === "string" ? req.query.userId : req.user!.id;
    if (!isAdmin && qUserId !== req.user!.id) {
      return res.status(403).json({ error: "You can only view your own tracking data" });
    }
    const date = typeof req.query.date === "string" ? req.query.date : dateKeyIST();
    const db = await getDb();
    const tracksCol = db.collection<LocationTrack>("locationTracks");
    const tracks = await tracksCol
      .find({
        ...userIdFilter(qUserId),
        recordedAt: { $gte: dayStartIST(date), $lte: dayEndIST(date) },
      })
      .sort({ recordedAt: 1 })
      .limit(2000)
      .toArray();

    return res.json(
      tracks.map((t) => ({
        ...t,
        id: t._id?.toString(),
        userId: t.userId.toString(),
      }))
    );
  } catch (error) {
    console.error("Location trail GET error:", error);
    return res.status(500).json({ error: "Failed to fetch location trail" });
  }
});

router.get("/location/session", async (req, res) => {
  try {
    const db = await getDb();
    const sessionsCol = db.collection<TrackingSession>("trackingSessions");
    const session = await sessionsCol.findOne({ ...userIdFilter(req.user!.id), active: true });
    return res.json({
      active: Boolean(session?.active),
      consented: Boolean(session?.consentAt),
      startedAt: session?.startedAt || null,
      sessionId: session?._id?.toString() || null,
    });
  } catch (error) {
    console.error("Location session GET error:", error);
    return res.status(500).json({ error: "Failed to fetch tracking session" });
  }
});

router.post("/location/session/start", async (req, res) => {
  try {
    if (req.body?.consent !== true) {
      return res.status(400).json({ error: "Tracking requires explicit consent." });
    }
    const db = await getDb();
    const sessionsCol = db.collection<TrackingSession>("trackingSessions");
    await sessionsCol.updateMany(
      { ...userIdFilter(req.user!.id), active: true },
      { $set: { active: false, endedAt: new Date() } }
    );
    const session: TrackingSession = {
      userId: new ObjectId(req.user!.id),
      userName: actorName(req),
      consentAt: new Date(),
      startedAt: new Date(),
      active: true,
      source: "OPT_IN",
    };
    const result = await sessionsCol.insertOne(session);
    return res.status(201).json({
      active: true,
      consented: true,
      sessionId: result.insertedId.toString(),
      startedAt: session.startedAt,
    });
  } catch (error) {
    console.error("Location session start error:", error);
    return res.status(500).json({ error: "Failed to start tracking" });
  }
});

router.post("/location/session/stop", async (req, res) => {
  try {
    const db = await getDb();
    const sessionsCol = db.collection<TrackingSession>("trackingSessions");
    await sessionsCol.updateMany(
      { ...userIdFilter(req.user!.id), active: true },
      { $set: { active: false, endedAt: new Date() } }
    );
    return res.json({ active: false });
  } catch (error) {
    console.error("Location session stop error:", error);
    return res.status(500).json({ error: "Failed to stop tracking" });
  }
});

router.get("/location", async (req, res) => {
  try {
    const db = await getDb();
    const tracksCol = db.collection<LocationTrack>("locationTracks");

    const tracks = await tracksCol
      .find(listFilter(req))
      .sort({ recordedAt: -1 })
      .limit(500)
      .toArray();

    return res.json(
      tracks.map((t) => ({
        ...t,
        id: t._id?.toString(),
        user: { fullName: t.userName },
      }))
    );
  } catch (error) {
    console.error("Location GET error:", error);
    return res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.post("/location", async (req, res) => {
  try {
    const db = await getDb();
    const tracksCol = db.collection<LocationTrack>("locationTracks");
    const data = req.body;
    if (!isValidCoord(data.latitude, data.longitude)) {
      return res.status(400).json({ error: "Valid latitude and longitude are required" });
    }

    const source = data.source || "MANUAL";
    let sessionId: ObjectId | undefined;
    if (source === "LIVE_TRACK") {
      const sessionsCol = db.collection<TrackingSession>("trackingSessions");
      const session = await sessionsCol.findOne({ ...userIdFilter(req.user!.id), active: true });
      const gate = canAcceptLivePing({
        consented: Boolean(session?.consentAt),
        sessionActive: Boolean(session?.active),
      });
      if (!gate.ok) {
        return res.status(400).json({ error: gate.error });
      }
      sessionId = session?._id;
    }

    const track: LocationTrack = {
      userId: new ObjectId(req.user!.id),
      userName: actorName(req),
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: data.accuracy ?? undefined,
      source,
      visitId: data.visitId && ObjectId.isValid(data.visitId) ? new ObjectId(data.visitId) : undefined,
      sessionId,
      addressLabel: data.addressLabel || undefined,
      recordedAt: new Date(),
    };

    const result = await tracksCol.insertOne(track);

    return res.status(201).json({
      ...track,
      id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("Location POST error:", error);
    return res.status(500).json({ error: "Failed to record location" });
  }
});

export default router;
