/**
 * Restore basePrice/mrp on master SKUs from older products and invoices.
 * Never overwrites a product that already has a rate.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import { INDICAFERT_PRODUCTS } from "../../prisma/data/indicafert-products";

function compact(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function packingKey(packing: unknown): string {
  return compact(packing).replace(/ltr/g, "lit").replace(/gms?/g, "gm");
}

function npkKey(name: unknown): string {
  const m = String(name || "").match(/(\d{1,2})\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : "";
}

function matchKeys(name: unknown, packing: unknown, code: unknown): string[] {
  const pack = packingKey(packing);
  const npk = npkKey(name);
  const codeKey = compact(code);
  const nameKey = compact(name);
  const keys: string[] = [];
  if (codeKey) keys.push(`code:${codeKey}`);
  if (npk && pack) keys.push(`npk:${npk}|${pack}`);
  if (nameKey && pack) keys.push(`name:${nameKey}|${pack}`);
  return keys;
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL missing");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const productsCol = db.collection("products");
  const invoicesCol = db.collection("invoices");

  const prices = new Map<string, { basePrice: number; mrp?: number | null }>();
  const remember = (
    keys: string[],
    basePrice: number,
    mrp?: number | null
  ) => {
    if (!Number.isFinite(basePrice) || basePrice <= 0) return;
    for (const key of keys) {
      if (!prices.has(key)) prices.set(key, { basePrice, mrp: mrp ?? null });
    }
  };

  const invoiceDocs = await invoicesCol
    .find({ "items.unitPrice": { $gt: 0 } })
    .project({
      "items.productName": 1,
      "items.packingSize": 1,
      "items.productCode": 1,
      "items.unitPrice": 1,
      "items.mrp": 1,
    })
    .toArray();
  for (const inv of invoiceDocs) {
    for (const item of inv.items || []) {
      remember(
        matchKeys(item.productName, item.packingSize, item.productCode),
        Number(item.unitPrice),
        item.mrp
      );
    }
  }

  const listByNpkPack = new Map<string, { basePrice: number; mrp?: number | null }>();
  const listByNamePack = new Map<string, { basePrice: number; mrp?: number | null }>();
  for (const row of INDICAFERT_PRODUCTS) {
    if (!(row.basePrice > 0)) continue;
    const npk = npkKey(row.name);
    const pack = packingKey(row.packingSize);
    const nameKey = compact(row.name);
    const price = { basePrice: row.basePrice, mrp: row.mrp ?? null };
    if (npk && pack && !listByNpkPack.has(`${npk}|${pack}`)) {
      listByNpkPack.set(`${npk}|${pack}`, price);
    }
    if (nameKey && pack && !listByNamePack.has(`${nameKey}|${pack}`)) {
      listByNamePack.set(`${nameKey}|${pack}`, price);
    }
  }

  const active = await productsCol.find({ status: "ACTIVE" }).toArray();
  let restored = 0;
  for (const p of active) {
    const npk = npkKey(p.name);
    const pack = packingKey(p.packingSize);
    const nameKey = compact(p.name);
    const fromList =
      (npk && pack ? listByNpkPack.get(`${npk}|${pack}`) : undefined) ||
      (nameKey && pack ? listByNamePack.get(`${nameKey}|${pack}`) : undefined);
    const fromInvoice = npk && pack ? prices.get(`npk:${npk}|${pack}`) : undefined;
    const found = fromList || fromInvoice;
    if (!found) continue;
    const current = Number(p.basePrice);
    const mrpMissing = p.mrp == null || Number(p.mrp) <= 0;
    if (current === found.basePrice && !(mrpMissing && found.mrp != null)) continue;
    const set: Record<string, unknown> = { basePrice: found.basePrice, updatedAt: new Date() };
    if (found.mrp != null) set.mrp = found.mrp;
    await productsCol.updateOne({ _id: p._id }, { $set: set });
    restored += 1;
    console.log(`Set ${p.productCode} ${p.name} ${p.packingSize} → ₹${found.basePrice}`);
  }

  const stillZero = await productsCol.countDocuments({
    status: "ACTIVE",
    $or: [{ basePrice: 0 }, { basePrice: { $exists: false } }, { basePrice: null }],
  });
  console.log(`Restored rates on ${restored} products. Still without rate: ${stillZero}.`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
