/**
 * Tally-style stock display math.
 * Stock is always stored in base units (Nos, or KG for Magnesium Sulphate).
 * Cases are derived for display only.
 */

/** Round half up (Tally-style); e.g. 1.5 → 2, 32.76 → 33. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + 0.5);
}

export function displayCases(baseQty: number, unitsPerCase: number): number {
  const upc = Number(unitsPerCase);
  if (!Number.isFinite(upc) || upc <= 0) return 0;
  return roundHalfUp(Number(baseQty) / upc);
}

/** Grand total cases = SUM of each line's rounded display_cases (not total_units / upc). */
export function grandTotalCases(lines: { baseQty: number; unitsPerCase: number }[]): number {
  return lines.reduce((sum, line) => sum + displayCases(line.baseQty, line.unitsPerCase), 0);
}

export type QtyUnit = "CASE" | "NOS" | "KG";

/** Convert Case or Nos/KG entry into base units for ledger storage. */
export function toBaseUnits(
  qty: number,
  unit: QtyUnit | string,
  unitsPerCase: number
): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) return 0;
  const u = String(unit || "NOS").trim().toUpperCase();
  if (u === "CASE" || u === "CASES") {
    const upc = Number(unitsPerCase);
    if (!Number.isFinite(upc) || upc <= 0) return 0;
    return n * upc;
  }
  // NOS / KG / base unit — store as entered
  return n;
}

export function normalizeUnitsPerCase(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
