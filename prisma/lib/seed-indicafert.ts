import { PrismaClient } from "@prisma/client";
import {
  INDICAFERT_PRODUCTS,
  INDICAFERT_SUB_CATEGORIES,
  displayProductName,
  type IndicafertSubCategoryKey,
} from "../data/indicafert-products";

export async function seedIndicafertCatalog(prisma: PrismaClient) {
  await prisma.product.updateMany({
    where: { productCode: { startsWith: "XV-" } },
    data: { status: "INACTIVE" },
  });

  const subCategoryIds = new Map<IndicafertSubCategoryKey, string>();

  for (const [key, meta] of Object.entries(INDICAFERT_SUB_CATEGORIES) as [
    IndicafertSubCategoryKey,
    (typeof INDICAFERT_SUB_CATEGORIES)[IndicafertSubCategoryKey],
  ][]) {
    const category = await prisma.productCategory.upsert({
      where: { name: meta.category },
      create: {
        name: meta.category,
        description: "Daichi International — Indicafert product line",
      },
      update: {},
    });

    const subCategory = await prisma.productSubCategory.upsert({
      where: {
        name_categoryId: { name: meta.name, categoryId: category.id },
      },
      create: {
        name: meta.name,
        categoryId: category.id,
      },
      update: {},
    });

    subCategoryIds.set(key, subCategory.id);
  }

  const products = [];

  for (const item of INDICAFERT_PRODUCTS) {
    const subCategoryId = subCategoryIds.get(item.subCategoryKey)!;
    const product = await prisma.product.upsert({
      where: { productCode: item.productCode },
      create: {
        productCode: item.productCode,
        name: displayProductName(item),
        subCategoryId,
        unitOfMeasure: item.unitOfMeasure,
        basePrice: item.basePrice,
        mrp: item.mrp,
        gstRate: item.gstRate,
        status: item.status ?? "ACTIVE",
        listSerialNo: item.listSerialNo,
        packingSize: item.packingSize,
        hsnCode: item.hsnCode,
        lotSize: item.lotSize,
        description:
          item.description ??
          "Indicafert price list effective 1/04/2026. GST extra as applicable.",
      },
      update: {
        name: displayProductName(item),
        subCategoryId,
        unitOfMeasure: item.unitOfMeasure,
        basePrice: item.basePrice,
        mrp: item.mrp,
        gstRate: item.gstRate,
        status: item.status ?? "ACTIVE",
        listSerialNo: item.listSerialNo,
        packingSize: item.packingSize,
        hsnCode: item.hsnCode,
        lotSize: item.lotSize,
        description:
          item.description ??
          "Indicafert price list effective 1/04/2026. GST extra as applicable.",
      },
    });
    products.push(product);
  }

  return products;
}
