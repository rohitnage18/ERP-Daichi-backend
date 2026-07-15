import { Router } from "express";
import { syncDaichiDealersNow } from "../lib/daichi-sync-mongo";

const router = Router();

router.post("/run", async (req, res) => {
  const secret = req.headers.authorization;
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await syncDaichiDealersNow();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("Daichi sync trigger failed:", error);
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
