/**
 * Canonical Daichi product categories for the product form dropdown.
 * Fertilizer master categories first; pesticide A–D last (nested under Pesticide in UI).
 */
export const PRODUCT_CATEGORY_NAMES = [
  "Speciality Water Soluble Fertilizer Grades",
  "Generic/Secondary Water Soluble Fertilizer Grades",
  "Secondary Nutrients",
  "Micro Nutrients",
  "Water Soluble Liquid Fertilizer Grades",
  "Primary Nutrients (N:P:K)",
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
  "Water Soluble Fertilizers": "Speciality Water Soluble Fertilizer Grades",
  "Liquid water-soluble fertilizer (WSF)": "Water Soluble Liquid Fertilizer Grades",
  "Bio Products": "Bio Fertilizers",
  "Crop Protection": "A - Insecticides",
  "Plant Growth Regulators": "D - Plant Growth Promoter / Retardant (PGR)",
  Micronutrients: "Micro Nutrients",
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
