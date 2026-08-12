/**
 * Canonical Daichi product categories for the product form dropdown.
 * Order is display order in the UI.
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
  "Insecticides",
  "Weedicides / herbicides",
  "Fungicides",
  "Plant Growth Promoter / Retardant (PGR)",
  "Pesticides",
] as const;

/** Map legacy seed category names → canonical names. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "Water Soluble Fertilizers": "Liquid water-soluble fertilizer (WSF)",
  "Bio Products": "Bio Fertilizers",
  "Crop Protection": "Pesticides",
  "Plant Growth Regulators": "Plant Growth Promoter / Retardant (PGR)",
  Micronutrients: "Micronutrients",
};
