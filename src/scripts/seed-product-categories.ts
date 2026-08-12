/**
 * Ensure productCategories collection has the canonical Daichi list.
 * Run: npx tsx src/scripts/seed-product-categories.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import {
  PRODUCT_CATEGORY_NAMES,
  LEGACY_CATEGORY_MAP,
} from "../lib/product-categories";

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const categoriesCol = db.collection("productCategories");
  const productsCol = db.collection("products");
  const now = new Date();

  // Remove junk categories like bare "1","2","A" if present
  const junk = await categoriesCol
    .find({
      name: { $in: [...Array.from({ length: 11 }, (_, i) => String(i + 1)), "A", "B", "C", "D", "Product Category"] },
    })
    .toArray();
  if (junk.length) {
    await categoriesCol.deleteMany({ _id: { $in: junk.map((j) => j._id) } });
    console.log(`Removed ${junk.length} junk categories`);
  }

  const nameToId = new Map<string, unknown>();

  for (let i = 0; i < PRODUCT_CATEGORY_NAMES.length; i++) {
    const name = PRODUCT_CATEGORY_NAMES[i];
    const existing = await categoriesCol.findOne({ name });
    if (existing) {
      await categoriesCol.updateOne(
        { _id: existing._id },
        { $set: { sortOrder: i + 1, updatedAt: now } }
      );
      nameToId.set(name, existing._id);
      console.log(`Exists: ${name}`);
    } else {
      const result = await categoriesCol.insertOne({
        name,
        sortOrder: i + 1,
        description: name,
        createdAt: now,
        updatedAt: now,
      });
      nameToId.set(name, result.insertedId);
      console.log(`Created: ${name}`);
    }
  }

  // Remap products from legacy category names
  for (const [legacy, canonical] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacy === canonical) continue;
    const newId = nameToId.get(canonical);
    if (!newId) continue;
    const result = await productsCol.updateMany(
      { categoryName: legacy },
      {
        $set: {
          categoryId: newId,
          categoryName: canonical,
          updatedAt: now,
        },
      }
    );
    if (result.modifiedCount) {
      console.log(`Remapped ${result.modifiedCount} products: ${legacy} → ${canonical}`);
    }
  }

  // Delete old legacy category docs (if no longer in canonical list)
  const keep = new Set<string>(PRODUCT_CATEGORY_NAMES as unknown as string[]);
  const all = await categoriesCol.find({}).toArray();
  for (const cat of all) {
    if (!keep.has(cat.name)) {
      // Only delete if no products still reference it
      const inUse = await productsCol.countDocuments({ categoryId: cat._id });
      if (inUse === 0) {
        await categoriesCol.deleteOne({ _id: cat._id });
        console.log(`Deleted unused category: ${cat.name}`);
      } else {
        console.log(`Kept legacy (still in use): ${cat.name} (${inUse} products)`);
      }
    }
  }

  console.log("Done.");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
