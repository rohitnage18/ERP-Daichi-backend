/**
 * Non-destructive migration: align Magnesium Sulphate packing with Tally
 * (base unit KG, 25 KG per case) and ensure inventoryMovements indexes.
 *
 * Run: npx tsx src/scripts/migrate-inventory-tally.ts
 * Does NOT delete or zero stock quantities.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");
  const client = new MongoClient(uri, { family: 4 });
  await client.connect();
  const db = client.db();

  const mag = await db.collection("products").updateMany(
    { productCode: "DI-SEC-024-25KG" },
    {
      $set: {
        unitsPerAlternate: 25,
        alternateUnit: "Case",
        unitOfMeasure: "Kg",
        updatedAt: new Date(),
      },
    }
  );
  console.log(`Magnesium Sulphate unitsPerAlternate=25 updated=${mag.modifiedCount}`);

  const movements = db.collection("inventoryMovements");
  await movements.createIndex({ createdAt: -1 }, { name: "createdAt" }).catch(() => undefined);
  await movements.createIndex({ productId: 1, createdAt: -1 }, { name: "productId_createdAt" }).catch(() => undefined);
  await movements.createIndex({ invoiceId: 1 }, { name: "invoiceId_sparse", sparse: true }).catch(() => undefined);
  await movements.createIndex({ type: 1, createdAt: -1 }, { name: "type_createdAt" }).catch(() => undefined);
  console.log("inventoryMovements indexes ensured");

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
