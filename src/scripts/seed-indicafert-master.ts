/**
 * Seed / reconcile Mongo products to the Approved Product Master only.
 * Run: npx tsx src/scripts/seed-indicafert-master.ts
 */
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { INDICAFERT_MASTER, MASTER_CATEGORY_NAMES, MASTER_PRODUCT_CODES } from "../lib/indicafert-master";
import { deriveLotSizeLabel, formatPackingSize } from "../lib/packing-math";
import { PRODUCT_CATEGORY_NAMES } from "../lib/product-categories";

function gstFromHsn(hsn: string | null): number {
  if (!hsn) return 5;
  if (hsn.startsWith("3105") || hsn.startsWith("3104") || hsn.startsWith("3102")) return 5;
  return 18;
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const categoriesCol = db.collection("productCategories");
  const productsCol = db.collection("products");
  const invoicesCol = db.collection("invoices");
  const inventoryCol = db.collection("inventoryItems");
  const now = new Date();

  const allCategoryNames = [...PRODUCT_CATEGORY_NAMES];
  const catId = new Map<string, ObjectId>();
  for (let i = 0; i < allCategoryNames.length; i++) {
    const name = allCategoryNames[i];
    const res = await categoriesCol.findOneAndUpdate(
      { name },
      {
        $set: { sortOrder: i + 1, updatedAt: now },
        $setOnInsert: { name, description: name, createdAt: now },
      },
      { upsert: true, returnDocument: "after" }
    );
    if (res?._id) catId.set(name, res._id as ObjectId);
  }

  let upserted = 0;
  for (const product of INDICAFERT_MASTER) {
    const categoryId = catId.get(product.category);
    if (!categoryId) throw new Error(`Missing category ${product.category}`);
    const packingType =
      product.category === "Water Soluble Liquid Fertilizer Grades" ? "LIQUID" : "POWDER_GRANULES";
    const gstRate = gstFromHsn(product.hsnCode);

    for (const pk of product.packings) {
      const packingSize = formatPackingSize(pk.unitSize, pk.unit);
      const lotSize = deriveLotSizeLabel(packingSize, pk.unitsPerCase) || "";
      const existing = await productsCol.findOne({ productCode: pk.productCode });
      const inheritedPrice =
        existing && Number(existing.basePrice) > 0 ? Number(existing.basePrice) : undefined;
      const inheritedMrp = existing?.mrp;
      const setDoc: Record<string, unknown> = {
        name: product.productName,
        categoryId,
        categoryName: product.category,
        hsnCode: product.hsnCode || undefined,
        packingType,
        packingSize,
        unitSize: pk.unitSize,
        packingUnit: pk.unit,
        unitsPerAlternate: pk.unitsPerCase ?? undefined,
        alternateUnit: "Case",
        unitOfMeasure: pk.unit === "lit" || pk.unit === "ml" ? "Ltr" : "Kg",
        lotSize,
        gstRate: existing?.gstRate ?? gstRate,
        status: "ACTIVE",
        updatedAt: now,
      };
      await productsCol.updateOne(
        { productCode: pk.productCode },
        {
          $set: setDoc,
          $setOnInsert: {
            productCode: pk.productCode,
            basePrice: inheritedPrice ?? 0,
            mrp: inheritedMrp,
            createdAt: now,
          },
        },
        { upsert: true }
      );
      upserted += 1;
    }
  }

  const extras = await productsCol
    .find({ productCode: { $nin: [...MASTER_PRODUCT_CODES] } })
    .toArray();

  const zeroMasters = await productsCol
    .find({
      productCode: { $in: [...MASTER_PRODUCT_CODES] },
      $or: [{ basePrice: 0 }, { basePrice: { $exists: false } }, { basePrice: null }],
    })
    .toArray();

  for (const extra of extras) {
    const extraPrice = Number(extra.basePrice);
    if (!Number.isFinite(extraPrice) || extraPrice <= 0) continue;
    const extraNpk = String(extra.name || "").match(/(\d{1,2})\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})/);
    const extraPack = String(extra.packingSize || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    for (const master of zeroMasters) {
      if (Number(master.basePrice) > 0) continue;
      const masterNpk = String(master.name || "").match(/(\d{1,2})\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})/);
      const masterPack = String(master.packingSize || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      const npkMatch =
        Boolean(extraNpk && masterNpk) &&
        extraNpk![1] === masterNpk![1] &&
        extraNpk![2] === masterNpk![2] &&
        extraNpk![3] === masterNpk![3];
      if (!extraPack || extraPack !== masterPack || !npkMatch) continue;
      await productsCol.updateOne(
        { _id: master._id },
        {
          $set: {
            basePrice: extraPrice,
            ...(extra.mrp != null ? { mrp: extra.mrp } : {}),
            updatedAt: now,
          },
        }
      );
      master.basePrice = extraPrice;
    }
  }

  let deleted = 0;
  let deactivated = 0;
  for (const extra of extras) {
    const used = await invoicesCol.countDocuments({ "items.productId": extra._id });
    if (used > 0) {
      await productsCol.updateOne(
        { _id: extra._id },
        { $set: { status: "INACTIVE", updatedAt: now } }
      );
      deactivated += 1;
    } else {
      await productsCol.deleteOne({ _id: extra._id });
      await inventoryCol.deleteMany({ productId: extra._id });
      deleted += 1;
    }
  }

  console.log(
    `Master SKUs upserted: ${upserted}. Extra deleted: ${deleted}. Extra deactivated (in invoices): ${deactivated}.`
  );
  console.log(`Master categories: ${MASTER_CATEGORY_NAMES.join(", ")}`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
