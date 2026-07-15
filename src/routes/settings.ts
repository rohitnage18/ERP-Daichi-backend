import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("MANAGEMENT_ADMIN"));

router.get("/", async (_req, res) => {
  try {
    const settings = await prisma.appSetting.findMany();
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return res.json(map);
  } catch (e) {
    console.error("Settings GET error:", e);
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const data = req.body;

    for (const [key, value] of Object.entries(data)) {
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("Settings PUT error:", e);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
