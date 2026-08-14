import { Router } from "express";
import { getDb, Product, DaichiDealer, Dealer } from "../../lib/mongodb";

const router = Router();

/** Unauthenticated company counts for the login screen — live Mongo totals. */
router.get("/stats", async (_req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const dealersCol = db.collection<Dealer>("dealers");
    const productsCol = db.collection<Product>("products");

    const [daichiDealers, localDealers, products] = await Promise.all([
      daichiDealersCol.countDocuments(),
      dealersCol.countDocuments().catch(() => 0),
      productsCol.countDocuments(),
    ]);

    return res.json({
      activeDealers: Math.max(daichiDealers, localDealers),
      products,
    });
  } catch (error) {
    console.error("Public stats error:", error);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
