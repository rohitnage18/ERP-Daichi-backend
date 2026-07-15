import { Router } from "express";
import { getDashboardStats } from "../lib/reports";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/stats", async (req, res) => {
  try {
    const zoneId =
      req.user!.role === "SALES_MARKETING" ? req.user!.zoneId : null;
    const stats = await getDashboardStats(zoneId);
    return res.json(stats);
  } catch (e) {
    console.error("Dashboard stats error:", e);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
