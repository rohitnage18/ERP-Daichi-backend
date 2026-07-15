/**
 * Import Indicafert catalog into an existing database (upsert by product code).
 * Run: npm run db:seed:products
 */
import { PrismaClient } from "@prisma/client";
import { seedIndicafertCatalog } from "./lib/seed-indicafert";

const prisma = new PrismaClient();

async function main() {
  const products = await seedIndicafertCatalog(prisma);
  const active = products.filter((p) => p.status === "ACTIVE");
  console.log(`Upserted ${products.length} products (${active.length} active).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
