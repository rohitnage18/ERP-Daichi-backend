/**
 * Normalize product lotSize / unitsPerAlternate from the packaging catalog.
 * - Catalog strings like "5Kg*3 unit=15 kg" → unitsPerAlternate = 3
 * - Legacy "100 Pcs" / "50 Bags" → unitsPerAlternate = 1 (not case size)
 *
 * Run: npx tsx src/scripts/normalize-product-lot-sizes.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import { INDICAFERT_PRODUCTS } from "../../prisma/data/indicafert-products";

function parseUnitsFromLotSize(lotSize?: string): number | null {
  if (!lotSize) return null;
  const m = lotSize.match(/\*\s*(\d+)\s*unit/i) || lotSize.match(/\*\s*(\d+)\s*=/i);
  return m ? parseInt(m[1], 10) : null;
}

function isLegacyStock(lotSize?: string): boolean {
  return /^\d+\s*(Btl|Bottles?|Pcs|Pieces?|Bags?|Nos|Pkt|Cans?)\b/i.test(lotSize || "");
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const products = db.collection("products");

  const byCode = new Map(
    INDICAFERT_PRODUCTS.map((p) => [p.productCode.toUpperCase(), p] as const)
  );

  let updated = 0;
  const cursor = products.find({});
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;

    const code = String(doc.productCode || "").toUpperCase();
    const catalog = byCode.get(code);
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (catalog) {
      if (catalog.lotSize) patch.lotSize = catalog.lotSize;
      if (catalog.packingSize) patch.packingSize = catalog.packingSize;
      if (catalog.hsnCode) patch.hsnCode = catalog.hsnCode;
      const units = parseUnitsFromLotSize(catalog.lotSize);
      if (units) {
        patch.unitsPerAlternate = units;
        patch.alternateUnit = "Case";
      }
    } else {
      const lotSize = String(doc.lotSize || "");
      const fromLot = parseUnitsFromLotSize(lotSize);
      if (fromLot) {
        patch.unitsPerAlternate = fromLot;
        patch.alternateUnit = "Case";
      } else if (isLegacyStock(lotSize)) {
        // Billing uses per-pack Nos — do not treat "100 Pcs" as case size.
        patch.unitsPerAlternate = 1;
        patch.alternateUnit = "Case";
        if (doc.packingSize) {
          patch.lotSize = `${doc.packingSize}*1 unit`;
        }
      }
    }

    const keys = Object.keys(patch).filter((k) => k !== "updatedAt");
    if (keys.length === 0) continue;

    await products.updateOne({ _id: doc._id }, { $set: patch });
    updated += 1;
    console.log(`Updated ${doc.productCode}:`, keys.map((k) => `${k}=${patch[k]}`).join(", "));
  }

  console.log(`Done. Updated ${updated} products.`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
