import { Request, Response, Router } from "express";
import { getDb, Product, DaichiDealer, Dealer } from "../../lib/mongodb";

const router = Router();

export async function getPublicStats(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const dealersCol = db.collection<Dealer>("dealers");
    const productsCol = db.collection<Product>("products");

    const [daichiDealers, localDealers, products] = await Promise.all([
      daichiDealersCol.countDocuments({ approvalStatus: { $ne: "REJECTED" } }),
      dealersCol.countDocuments({ status: { $nin: ["REJECTED"] } }).catch(() => 0),
      productsCol.countDocuments({ status: "ACTIVE" }),
    ]);

    return res.json({
      activeDealers: daichiDealers + localDealers,
      products,
    });
  } catch (error) {
    console.error("Public stats error:", error);
    return res.status(500).json({ error: "Failed to load stats" });
  }
}

router.get("/stats", getPublicStats);

export default router;
