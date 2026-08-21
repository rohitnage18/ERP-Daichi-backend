import { Router } from "express";
import { getDb, Product, DaichiDealer, Dealer } from "../../lib/mongodb";

const router = Router();

function dealerKey(d: { gstNumber?: string; firmName?: string; _id?: unknown }): string {
  const gst = String(d.gstNumber || "").trim().toLowerCase();
  if (gst) return `gst:${gst}`;
  const name = String(d.firmName || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${String(d._id || "")}`;
}

/** Unauthenticated live counts for the login screen. */
router.get("/stats", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const dealersCol = db.collection<Dealer>("dealers");
    const productsCol = db.collection<Product>("products");

    const [daichiDealers, localDealers, products] = await Promise.all([
      daichiDealersCol
        .find({ approvalStatus: { $ne: "REJECTED" } }, { projection: { gstNumber: 1, firmName: 1 } })
        .toArray(),
      dealersCol
        .find({ status: { $nin: ["REJECTED"] } }, { projection: { gstNumber: 1, firmName: 1 } })
        .toArray()
        .catch(() => [] as Dealer[]),
      productsCol.countDocuments({ status: "ACTIVE" }),
    ]);

    const dealerKeys = new Set<string>();
    for (const d of [...daichiDealers, ...localDealers]) {
      dealerKeys.add(dealerKey(d));
    }

    return res.json({
      activeDealers: dealerKeys.size,
      products,
    });
  } catch (error) {
    console.error("Public stats error:", error);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
