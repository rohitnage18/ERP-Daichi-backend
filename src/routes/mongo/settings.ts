import { Router } from "express";
import { getDb } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("MANAGEMENT_ADMIN"));

interface AppSettingDoc {
  key: string;
  value: string;
  updatedAt: Date;
}

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const settingsCol = db.collection<AppSettingDoc>("appSettings");
    const settings = await settingsCol.find({}).toArray();
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return res.json(map);
  } catch (error) {
    console.error("Settings GET error:", error);
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const db = await getDb();
    const settingsCol = db.collection<AppSettingDoc>("appSettings");
    const data = req.body as Record<string, unknown>;
    const now = new Date();

    for (const [key, value] of Object.entries(data)) {
      await settingsCol.updateOne(
        { key },
        { $set: { key, value: String(value), updatedAt: now } },
        { upsert: true }
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
