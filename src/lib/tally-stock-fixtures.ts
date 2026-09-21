/**
 * Tally Finished Goods fixtures for the 24 SKUs used in stock reconciliation.
 * Quantities are in base units (Nos; Magnesium Sulphate in KG).
 */
import { displayCases, grandTotalCases } from "./stock-math";

export type TallySku = {
  /** Short label matching the task table */
  key: string;
  productCode: string;
  /** Tally product spelling for display/reconciliation */
  tallyName: string;
  baseUnit: "Nos" | "KG";
  unitsPerCase: number;
  inwards: number;
  snapshotA: number;
  snapshotB: number;
};

export const TALLY_FINISHED_GOODS: TallySku[] = [
  {
    key: "caltica-1ltr",
    productCode: "DI-LIQ-004-1000ML",
    tallyName: "Caltica 11 (Liquid Calcium 11%) 1 Ltr",
    baseUnit: "Nos",
    unitsPerCase: 10,
    inwards: 580,
    snapshotA: 510,
    snapshotB: 510,
  },
  {
    key: "caltica-500ml",
    productCode: "DI-LIQ-004-500ML",
    tallyName: "Caltica 11 (Liquid Calcium 11%) 500 Ml",
    baseUnit: "Nos",
    unitsPerCase: 20,
    inwards: 960,
    snapshotA: 720,
    snapshotB: 720,
  },
  {
    key: "npk-000050-1kg",
    productCode: "DI-GWSF-016-1KG",
    tallyName: "Indicafert NPK 00:00:50 - 1 Kg",
    baseUnit: "Nos",
    unitsPerCase: 25,
    inwards: 1000,
    snapshotA: 850,
    snapshotB: 850,
  },
  {
    key: "npk-000050-5kg",
    productCode: "DI-GWSF-016-5KG",
    tallyName: "Indicafert NPK 00:00:50 - 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 5,
    inwards: 200,
    snapshotA: 110,
    snapshotB: 110,
  },
  {
    key: "npk-000946-2.5kg",
    productCode: "DI-SWSF-004-2.5KG",
    tallyName: "Indicafert NPK 00:09:46+TE- 2.5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 6,
    inwards: 396,
    snapshotA: 210,
    snapshotB: 198,
  },
  {
    key: "npk-000946-5kg",
    productCode: "DI-SWSF-004-5KG",
    tallyName: "Indicafert NPK 00:09:46+TE- 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 3,
    inwards: 186,
    snapshotA: 126,
    snapshotB: 123,
  },
  {
    key: "npk-004247-2kg",
    productCode: "DI-SWSF-003-2KG",
    tallyName: "Indicafert NPK 00:42:47 - 2 Kg",
    baseUnit: "Nos",
    unitsPerCase: 3,
    inwards: 981,
    snapshotA: 825,
    snapshotB: 813,
  },
  {
    key: "npk-005234-1kg",
    productCode: "DI-GWSF-015-1KG",
    tallyName: "Indicafert NPK 00:52:34 - 1 Kg",
    baseUnit: "Nos",
    unitsPerCase: 25,
    inwards: 1025,
    snapshotA: 750,
    snapshotB: 700,
  },
  {
    key: "npk-005234-5kg",
    productCode: "DI-GWSF-015-5KG",
    tallyName: "Indicafert NPK 00:52:34 - 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 5,
    inwards: 585,
    snapshotA: 460,
    snapshotB: 455,
  },
  {
    key: "npk-055517-2.5kg",
    productCode: "DI-SWSF-008-2.5KG",
    tallyName: "Indicafert NPK 05:55:17+TE- 2.5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 6,
    inwards: 540,
    snapshotA: 108,
    snapshotB: 78,
  },
  {
    key: "npk-126100-1kg",
    productCode: "DI-GWSF-014-1KG",
    tallyName: "Indicafert NPK 12:61:00 - 1 Kg",
    baseUnit: "Nos",
    unitsPerCase: 25,
    inwards: 1000,
    snapshotA: 705,
    snapshotB: 705,
  },
  {
    key: "npk-126100-5kg",
    productCode: "DI-GWSF-014-5KG",
    tallyName: "Indicafert NPK 12:61:00 - 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 5,
    inwards: 190,
    snapshotA: 18,
    snapshotB: 8,
  },
  {
    key: "npk-130045-1kg",
    productCode: "DI-GWSF-020-1KG",
    tallyName: "Indicafert NPK 13:00:45 - 1 Kg",
    baseUnit: "Nos",
    unitsPerCase: 25,
    inwards: 1000,
    snapshotA: 819,
    snapshotB: 819,
  },
  {
    key: "npk-130045-5kg",
    productCode: "DI-GWSF-020-5KG",
    tallyName: "Indicafert NPK 13:00:45 - 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 5,
    inwards: 980,
    snapshotA: 870,
    snapshotB: 870,
  },
  {
    key: "npk-144800-2.5kg",
    productCode: "DI-SWSF-010-2.5KG",
    tallyName: "Indicafert NPK 14:48:00+TE- 2.5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 6,
    inwards: 372,
    snapshotA: 126,
    snapshotB: 108,
  },
  {
    key: "npk-144800-5kg",
    productCode: "DI-SWSF-010-5KG",
    tallyName: "Indicafert NPK 14:48:00+TE- 5 Kg",
    baseUnit: "Nos",
    unitsPerCase: 3,
    inwards: 183,
    snapshotA: 108,
    snapshotB: 108,
  },
  {
    key: "mag-25kg",
    productCode: "DI-SEC-024-25KG",
    tallyName: "Magnasium Sulphate 25 KG",
    baseUnit: "KG",
    unitsPerCase: 25,
    inwards: 25000,
    snapshotA: 17925,
    snapshotB: 16925,
  },
  {
    key: "nitrofos-500ml",
    productCode: "DI-LIQ-002-500ML",
    tallyName: "Nitrofos NPK: 10:34:00 500 ML",
    baseUnit: "Nos",
    unitsPerCase: 20,
    inwards: 100,
    snapshotA: 100,
    snapshotB: 100,
  },
  {
    key: "thiocal-1ltr",
    productCode: "DI-LIQ-007-1LIT",
    tallyName: "Thio Cal 1 Ltr",
    baseUnit: "Nos",
    unitsPerCase: 10,
    inwards: 260,
    snapshotA: 180,
    snapshotB: 180,
  },
  {
    key: "thiocal-250ml",
    productCode: "DI-LIQ-007-250ML",
    tallyName: "Thio Cal 250 ML",
    baseUnit: "Nos",
    unitsPerCase: 40,
    inwards: 800,
    snapshotA: 520,
    snapshotB: 520,
  },
  {
    key: "thiocal-500ml",
    productCode: "DI-LIQ-007-500ML",
    tallyName: "Thio Cal 500 ML",
    baseUnit: "Nos",
    unitsPerCase: 20,
    inwards: 1000,
    snapshotA: 880,
    snapshotB: 880,
  },
  {
    key: "zincox-1ltr",
    productCode: "DI-LIQ-005-1000ML",
    tallyName: "ZINCOX 39% 1 Ltr",
    baseUnit: "Nos",
    unitsPerCase: 10,
    inwards: 290,
    snapshotA: 230,
    snapshotB: 230,
  },
  {
    key: "zincox-250ml",
    productCode: "DI-LIQ-005-250ML",
    tallyName: "ZINCOX 39% 250ML",
    baseUnit: "Nos",
    unitsPerCase: 40,
    inwards: 800,
    snapshotA: 80,
    snapshotB: 80,
  },
  {
    key: "zincox-500ml",
    productCode: "DI-LIQ-005-500ML",
    tallyName: "ZINCOX 39% 500ML",
    baseUnit: "Nos",
    unitsPerCase: 20,
    inwards: 1000,
    snapshotA: 880,
    snapshotB: 880,
  },
];

export function tallyByKey(key: string): TallySku {
  const row = TALLY_FINISHED_GOODS.find((r) => r.key === key);
  if (!row) throw new Error(`Unknown Tally SKU key: ${key}`);
  return row;
}

export function snapshotCases(field: "inwards" | "snapshotA" | "snapshotB"): number {
  return grandTotalCases(
    TALLY_FINISHED_GOODS.map((r) => ({ baseQty: r[field], unitsPerCase: r.unitsPerCase }))
  );
}

export function lineCases(field: "inwards" | "snapshotA" | "snapshotB"): { key: string; cases: number }[] {
  return TALLY_FINISHED_GOODS.map((r) => ({
    key: r.key,
    cases: displayCases(r[field], r.unitsPerCase),
  }));
}

/** A→B invoice replay quantities (base units), mixing Case and Nos entry intent. */
export const REPLAY_A_TO_B: {
  key: string;
  entryQty: number;
  entryUnit: "CASE" | "NOS";
  baseUnits: number;
}[] = [
  { key: "npk-000946-2.5kg", entryQty: 2, entryUnit: "CASE", baseUnits: 12 },
  { key: "npk-000946-5kg", entryQty: 3, entryUnit: "NOS", baseUnits: 3 },
  { key: "npk-004247-2kg", entryQty: 4, entryUnit: "CASE", baseUnits: 12 },
  { key: "npk-005234-1kg", entryQty: 50, entryUnit: "NOS", baseUnits: 50 },
  { key: "npk-005234-5kg", entryQty: 1, entryUnit: "CASE", baseUnits: 5 },
  { key: "npk-055517-2.5kg", entryQty: 5, entryUnit: "CASE", baseUnits: 30 },
  { key: "npk-126100-5kg", entryQty: 10, entryUnit: "NOS", baseUnits: 10 },
  { key: "npk-144800-2.5kg", entryQty: 3, entryUnit: "CASE", baseUnits: 18 },
  { key: "mag-25kg", entryQty: 40, entryUnit: "CASE", baseUnits: 1000 },
];
