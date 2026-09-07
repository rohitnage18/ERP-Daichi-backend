/**
 * Set warehouse stock from Tally Finished Goods closing balance
 * 1-Apr-26 to 3-Sep-26 (Stock_As_per_03.09.2026_Updated.pdf).
 *
 * Run: npx tsx src/scripts/seed-inventory-sep2026.ts
 */
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

/** Closing quantity from the 3-Sep-26 stock summary (Nos, except Magnesium in KG). */
const CLOSING_STOCK: { productCode: string; quantity: number }[] = [
  { productCode: "DI-LIQ-004-1000ML", quantity: 510 },
  { productCode: "DI-LIQ-004-500ML", quantity: 720 },
  { productCode: "DI-GWSF-016-1KG", quantity: 850 },
  { productCode: "DI-GWSF-016-5KG", quantity: 110 },
  { productCode: "DI-SWSF-004-2.5KG", quantity: 198 },
  { productCode: "DI-SWSF-004-5KG", quantity: 123 },
  { productCode: "DI-SWSF-003-2KG", quantity: 813 },
  { productCode: "DI-GWSF-015-1KG", quantity: 700 },
  { productCode: "DI-GWSF-015-5KG", quantity: 455 },
  { productCode: "DI-SWSF-008-2.5KG", quantity: 78 },
  { productCode: "DI-GWSF-014-1KG", quantity: 705 },
  { productCode: "DI-GWSF-014-5KG", quantity: 8 },
  { productCode: "DI-GWSF-020-1KG", quantity: 819 },
  { productCode: "DI-GWSF-020-5KG", quantity: 870 },
  { productCode: "DI-SWSF-010-2.5KG", quantity: 108 },
  { productCode: "DI-SWSF-010-5KG", quantity: 108 },
  { productCode: "DI-SEC-024-25KG", quantity: 16925 },
  { productCode: "DI-LIQ-002-500ML", quantity: 100 },
  { productCode: "DI-LIQ-007-1LIT", quantity: 180 },
  { productCode: "DI-LIQ-007-250ML", quantity: 520 },
  { productCode: "DI-LIQ-007-500ML", quantity: 880 },
  { productCode: "DI-LIQ-005-1000ML", quantity: 230 },
  { productCode: "DI-LIQ-005-250ML", quantity: 80 },
  { productCode: "DI-LIQ-005-500ML", quantity: 880 },
];

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const productsCol = db.collection("products");
  const inventoryCol = db.collection("inventoryItems");
  const now = new Date();

  let updated = 0;
  let missing = 0;

  for (const row of CLOSING_STOCK) {
    const product = await productsCol.findOne({ productCode: row.productCode });
    if (!product?._id) {
      console.warn("Product not found:", row.productCode);
      missing += 1;
      continue;
    }

    if (row.productCode === "DI-SEC-024-25KG" && product.status === "INACTIVE") {
      await productsCol.updateOne(
        { _id: product._id },
        { $set: { status: "ACTIVE", updatedAt: now } }
      );
      console.log("Activated", row.productCode);
    }

    const pid = product._id as ObjectId;
    const existing = await inventoryCol.findOne({ productId: pid });
    if (existing) {
      await inventoryCol.updateOne(
        { _id: existing._id },
        {
          $set: {
            quantity: row.quantity,
            lastUpdated: now,
            stockPeriodFrom: "2026-04-01",
            stockPeriodTo: "2026-09-03",
          },
        }
      );
    } else {
      await inventoryCol.insertOne({
        productId: pid,
        quantity: row.quantity,
        reorderLevel: 10,
        warehouseCode: "PUNE-01",
        lastUpdated: now,
        stockPeriodFrom: "2026-04-01",
        stockPeriodTo: "2026-09-03",
      });
    }
    updated += 1;
    console.log(`${row.productCode} → ${row.quantity}`);
  }

  console.log(`Done. Updated ${updated}, missing ${missing}.`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
