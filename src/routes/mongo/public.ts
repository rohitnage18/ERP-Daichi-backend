import { Router } from "express";
import { getDb, Product, DaichiDealer, District } from "../../lib/mongodb";

const router = Router();

function uniqueLabels(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const label = value.trim();
    if (!label) continue;
    seen.add(label.toLowerCase());
  }
  return [...seen];
}

/** Unauthenticated company counts for the login screen — live Mongo data only. */
router.get("/stats", async (_req, res) => {
  try {
    const db = await getDb();
    const dealersCol = db.collection<DaichiDealer>("daichiDealers");
    const productsCol = db.collection<Product>("products");
    const districtsCol = db.collection<District>("districts");

    const [dealerCount, activeProducts, allProducts, districtDocs, dealerDistricts, dealerCities] =
      await Promise.all([
        dealersCol.countDocuments(),
        productsCol.countDocuments({ status: "ACTIVE" }),
        productsCol.countDocuments(),
        districtsCol.countDocuments(),
        dealersCol.distinct("district"),
        dealersCol.distinct("city"),
      ]);

    const coveredFromDealers = uniqueLabels([...dealerDistricts, ...dealerCities]).length;
    const districtsCovered = Math.max(districtDocs, coveredFromDealers);
    const products = activeProducts || allProducts;

    return res.json({
      districtsCovered,
      activeDealers: dealerCount,
      products,
    });
  } catch (error) {
    console.error("Public stats error:", error);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
