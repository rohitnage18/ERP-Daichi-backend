import type { PackingUnit } from "./packing-math";
import { formatPackingSize } from "./packing-math";

export const MASTER_CATEGORY_NAMES = [
  "Speciality Water Soluble Fertilizer Grades",
  "Generic/Secondary Water Soluble Fertilizer Grades",
  "Secondary Nutrients",
  "Micro Nutrients",
  "Water Soluble Liquid Fertilizer Grades",
] as const;

export type MasterPacking = {
  unitSize: number;
  unit: PackingUnit;
  unitsPerCase: number | null;
  productCode: string;
};

export type MasterProduct = {
  category: (typeof MASTER_CATEGORY_NAMES)[number];
  productName: string;
  hsnCode: string | null;
  packings: MasterPacking[];
};

/** Approved Product Master — SKU per packing so invoices stay SKU-based. */
export const INDICAFERT_MASTER: MasterProduct[] = [
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:60:20]",
    hsnCode: "31052000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-001-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-001-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 17:44:00]",
    hsnCode: "31055900",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-002-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-002-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:42:47]",
    hsnCode: "31056000",
    packings: [{ unitSize: 2, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-003-2KG" }],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:09:46]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-004-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-004-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 09:46:00]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-005-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-005-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:48:47]",
    hsnCode: null,
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-006-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-006-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 10:54:10]",
    hsnCode: null,
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-007-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-007-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 30:10:10]",
    hsnCode: null,
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-008-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-008-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 05:55:17]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-009-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-009-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:33:65]",
    hsnCode: null,
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-010-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-010-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 14:48:00]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-011-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-011-2.5KG" },
    ],
  },
  {
    category: "Speciality Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 15:30:15]",
    hsnCode: null,
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 3, productCode: "DI-SWSF-012-5KG" },
      { unitSize: 2.5, unit: "kg", unitsPerCase: 6, productCode: "DI-SWSF-012-2.5KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 12:61:00]",
    hsnCode: "31054000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-014-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-014-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:52:34]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-015-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-015-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 00:00:50]",
    hsnCode: "31043000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-016-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-016-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 19:19:19]",
    hsnCode: "31052000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-017-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-017-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 20:20:20]",
    hsnCode: "31052000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-018-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-018-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 13:40:13]",
    hsnCode: "31052000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-019-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-019-1KG" },
    ],
  },
  {
    category: "Generic/Secondary Water Soluble Fertilizer Grades",
    productName: "Indicafert [NPK 13:00:45]",
    hsnCode: "31059000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-GWSF-020-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-GWSF-020-1KG" },
    ],
  },
  {
    category: "Secondary Nutrients",
    productName: "Indicafert [Potassium Schoenite]",
    hsnCode: "31059090",
    packings: [
      { unitSize: 25, unit: "kg", unitsPerCase: 1, productCode: "DI-SEC-021-25KG" },
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-SEC-021-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-SEC-021-1KG" },
    ],
  },
  {
    category: "Secondary Nutrients",
    productName: "Calcium Nitrate [CaNO3]",
    hsnCode: "31026000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-SEC-022-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-SEC-022-1KG" },
    ],
  },
  {
    category: "Secondary Nutrients",
    productName: "Calcium Nitrate With Boron",
    hsnCode: "31026000",
    packings: [
      { unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-SEC-023-5KG" },
      { unitSize: 1, unit: "kg", unitsPerCase: 25, productCode: "DI-SEC-023-1KG" },
    ],
  },
  {
    category: "Secondary Nutrients",
    productName: "Magnesium Sulphate [MgSO4 9.6%]",
    hsnCode: "28332100",
    packings: [{ unitSize: 25, unit: "kg", unitsPerCase: 1, productCode: "DI-SEC-024-25KG" }],
  },
  {
    category: "Secondary Nutrients",
    productName: "Sulfura (Sulphur 90% [DGR])",
    hsnCode: null,
    packings: [{ unitSize: 5, unit: "kg", unitsPerCase: 5, productCode: "DI-SEC-025-5KG" }],
  },
  {
    category: "Secondary Nutrients",
    productName: "Bentosul (Bentoate Sulphur 90%)",
    hsnCode: null,
    packings: [{ unitSize: 3, unit: "kg", unitsPerCase: 10, productCode: "DI-SEC-026-3KG" }],
  },
  {
    category: "Micro Nutrients",
    productName: "Indicafert Fe 12% [EDTA]",
    hsnCode: "28332900",
    packings: [
      { unitSize: 100, unit: "gm", unitsPerCase: null, productCode: "DI-MIC-028-100GM" },
      { unitSize: 250, unit: "gm", unitsPerCase: 40, productCode: "DI-MIC-028-250GM" },
      { unitSize: 500, unit: "gm", unitsPerCase: 20, productCode: "DI-MIC-028-500GM" },
    ],
  },
  {
    category: "Micro Nutrients",
    productName: "Indicafert ZN 12% [EDTA]",
    hsnCode: "28332990",
    packings: [
      { unitSize: 100, unit: "gm", unitsPerCase: null, productCode: "DI-MIC-029-100GM" },
      { unitSize: 250, unit: "gm", unitsPerCase: 40, productCode: "DI-MIC-029-250GM" },
      { unitSize: 500, unit: "gm", unitsPerCase: 20, productCode: "DI-MIC-029-500GM" },
    ],
  },
  {
    category: "Micro Nutrients",
    productName: "Indicafert Boron 20% [DOT]",
    hsnCode: "28401900",
    packings: [
      { unitSize: 250, unit: "gm", unitsPerCase: 40, productCode: "DI-MIC-030-250GM" },
      { unitSize: 500, unit: "gm", unitsPerCase: 20, productCode: "DI-MIC-030-500GM" },
      { unitSize: 1, unit: "kg", unitsPerCase: 10, productCode: "DI-MIC-030-1KG" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "NEUREA-N.32% (Urea Amm. Nitrate)",
    hsnCode: null,
    packings: [
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-001-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-001-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "NITROPHOS SUPER [NPK 10:34:00]",
    hsnCode: "31056000",
    packings: [
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-002-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-002-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "LUMINA [NPK 09:40:09]",
    hsnCode: null,
    packings: [
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-003-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-003-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "CALTICA 11% (Liquid Calcium 11%)",
    hsnCode: "28352610",
    packings: [
      { unitSize: 5, unit: "lit", unitsPerCase: 2, productCode: "DI-LIQ-004-5LIT" },
      { unitSize: 1000, unit: "ml", unitsPerCase: 10, productCode: "DI-LIQ-004-1000ML" },
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-004-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-004-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "ZINCOX-39 (Zinc Oxide)",
    hsnCode: "28170010",
    packings: [
      { unitSize: 1000, unit: "ml", unitsPerCase: 10, productCode: "DI-LIQ-005-1000ML" },
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-005-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-005-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "THIO POTASH (Potassium Thio Sulphate)",
    hsnCode: null,
    packings: [
      { unitSize: 1000, unit: "ml", unitsPerCase: 10, productCode: "DI-LIQ-006-1LIT" },
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-006-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-006-250ML" },
    ],
  },
  {
    category: "Water Soluble Liquid Fertilizer Grades",
    productName: "THIO CAL (Calcium Thio Sulphate)",
    hsnCode: "28323090",
    packings: [
      { unitSize: 1000, unit: "ml", unitsPerCase: 10, productCode: "DI-LIQ-007-1LIT" },
      { unitSize: 500, unit: "ml", unitsPerCase: 20, productCode: "DI-LIQ-007-500ML" },
      { unitSize: 250, unit: "ml", unitsPerCase: 40, productCode: "DI-LIQ-007-250ML" },
    ],
  },
];

export const MASTER_PRODUCT_CODES = new Set(
  INDICAFERT_MASTER.flatMap((p) => p.packings.map((pk) => pk.productCode))
);

export function packingDisplay(pk: MasterPacking): string {
  return formatPackingSize(pk.unitSize, pk.unit);
}
