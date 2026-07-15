import { Router } from "express";
import { getDb, Zone, District } from "../../lib/mongodb";
import { requireAuth } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const zonesCol = db.collection<Zone>("zones");
    const districtsCol = db.collection<District>("districts");

    const [zones, districts] = await Promise.all([
      zonesCol.find().sort({ name: 1 }).toArray(),
      districtsCol.find().sort({ name: 1 }).toArray(),
    ]);

    const districtsByZone = new Map<string, { id: string; name: string; code: string }[]>();
    for (const district of districts) {
      const zoneKey = district.zoneId.toString();
      const list = districtsByZone.get(zoneKey) ?? [];
      list.push({
        id: district._id!.toString(),
        name: district.name,
        code: district.code,
      });
      districtsByZone.set(zoneKey, list);
    }

    return res.json(
      zones.map((zone) => ({
        id: zone._id!.toString(),
        name: zone.name,
        code: zone.code,
        division: zone.divisionName ? { name: zone.divisionName } : null,
        districts: districtsByZone.get(zone._id!.toString()) ?? [],
      }))
    );
  } catch (error) {
    console.error("Error fetching zones:", error);
    return res.status(500).json({ error: "Failed to fetch zones" });
  }
});

export default router;
