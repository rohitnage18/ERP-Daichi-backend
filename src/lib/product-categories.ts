/**
 * Canonical Daichi product categories for the product form dropdown.
 * Pesticide types are coded A–D.
 */
export const PRODUCT_CATEGORY_NAMES = [
  "Primary Nutrients (N:P:K)",
  "Secondary Nutrients",
  "Micronutrients",
  "Liquid water-soluble fertilizer (WSF)",
  "Secondary liquid water-soluble fertilizer",
  "Liquid micronutrients",
  "Bio Fertilizers",
  "Bio pesticides",
  "Organic fertilizers",
  "Bio Stimulants",
  "A - Insecticides",
  "B - Weedicides / herbicides",
  "C - Fungicides",
  "D - Plant Growth Promoter / Retardant (PGR)",
] as const;

/** Map legacy / short names → canonical names. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "Water Soluble Fertilizers": "Liquid water-soluble fertilizer (WSF)",
  "Bio Products": "Bio Fertilizers",
  "Crop Protection": "A - Insecticides",
  "Plant Growth Regulators": "D - Plant Growth Promoter / Retardant (PGR)",
  Micronutrients: "Micronutrients",
  Insecticides: "A - Insecticides",
  "Weedicides / herbicides": "B - Weedicides / herbicides",
  Fungicides: "C - Fungicides",
  "Plant Growth Promoter / Retardant (PGR)": "D - Plant Growth Promoter / Retardant (PGR)",
  Pesticides: "A - Insecticides",
  A: "A - Insecticides",
  B: "B - Weedicides / herbicides",
  C: "C - Fungicides",
  D: "D - Plant Growth Promoter / Retardant (PGR)",
};
