import { Request, Response, Router } from "express";
import { getDb, Product, DaichiDealer } from "../../lib/mongodb";

const router = Router();

export async function loadCompanyStats(): Promise<{ activeDealers: number; products: number }> {
  const db = await getDb();
  const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
  const productsCol = db.collection<Product>("products");

  const [totalDealers, products] = await Promise.all([
    daichiDealersCol.countDocuments(),
    productsCol.countDocuments({ status: "ACTIVE" }),
  ]);

  return {
    activeDealers: totalDealers,
    products,
  };
}

export async function getPublicStats(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const stats = await loadCompanyStats();
    return res.json(stats);
  } catch (error) {
    console.error("Public stats error:", error);
    return res.status(500).json({ error: "Failed to load stats" });
  }
}

router.get("/stats", getPublicStats);

export default router;
