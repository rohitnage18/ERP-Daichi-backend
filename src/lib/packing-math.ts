export type PackingUnit = "kg" | "gm" | "ml" | "lit";

export function isPositiveInteger(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0;
}

export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

/** Display packing, e.g. 0.25 kg → "250 gm", 5 kg → "5 Kg". */
export function formatPackingSize(unitSize: number, unit: PackingUnit): string {
  if (unit === "kg" && unitSize > 0 && unitSize < 1) {
    const gm = Math.round(unitSize * 1000);
    return `${gm} gm`;
  }
  if (unit === "kg") return `${formatQty(unitSize)} Kg`;
  if (unit === "gm") return `${formatQty(unitSize)} gm`;
  if (unit === "ml") return `${formatQty(unitSize)} ml`;
  if (unit === "lit") return `${formatQty(unitSize)} Lit`;
  return `${formatQty(unitSize)} ${unit}`;
}

export function parsePackingUnitSize(
  packingSize?: string | null
): { unitSize: number; unit: PackingUnit } | null {
  if (!packingSize) return null;
  const m = String(packingSize)
    .trim()
    .match(/^([\d.]+)\s*(kg|g|gm|ml|l|lit|ltr)?/i);
  if (!m) return null;
  const unitSize = parseFloat(m[1]);
  if (!Number.isFinite(unitSize) || unitSize <= 0) return null;
  let unit = (m[2] || "kg").toLowerCase();
  if (unit === "g") unit = "gm";
  if (unit === "l" || unit === "ltr") unit = "lit";
  if (unit !== "kg" && unit !== "gm" && unit !== "ml" && unit !== "lit") unit = "kg";
  return { unitSize, unit: unit as PackingUnit };
}

/**
 * lotSize = unitSize × unitsPerCase, with gm/ml rolled up to kg/lit when whole thousands.
 * Never stored independently — always derived.
 */
export function deriveLotSize(
  unitSize: number,
  unit: PackingUnit,
  unitsPerCase: number | null | undefined
): { value: number; unit: PackingUnit; label: string } | null {
  if (!isPositiveInteger(unitsPerCase) || !Number.isFinite(unitSize) || unitSize <= 0) {
    return null;
  }
  let value = unitSize * unitsPerCase;
  let outUnit: PackingUnit = unit;
  if ((unit === "gm") && value >= 1000 && value % 1000 === 0) {
    value = value / 1000;
    outUnit = "kg";
  } else if (unit === "ml" && value >= 1000 && value % 1000 === 0) {
    value = value / 1000;
    outUnit = "lit";
  }
  return { value, unit: outUnit, label: `${formatQty(value)} ${outUnit}` };
}

export function deriveLotSizeLabel(
  packingSize: string | null | undefined,
  unitsPerCase: number | null | undefined
): string | null {
  const parsed = parsePackingUnitSize(packingSize);
  if (!parsed) return null;
  const lot = deriveLotSize(parsed.unitSize, parsed.unit, unitsPerCase);
  if (!lot) return null;
  const pack = formatPackingSize(parsed.unitSize, parsed.unit).replace(" ", "");
  return `${pack}*${unitsPerCase} unit=${lot.label}`;
}

/** casePrice = pricePerUnit × unitsPerCase. Null while price is unset. */
export function deriveCasePrice(
  pricePerUnit: number | null | undefined,
  unitsPerCase: number | null | undefined
): number | null {
  if (pricePerUnit == null || !Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;
  if (!isPositiveInteger(unitsPerCase)) return null;
  return Math.round(pricePerUnit * unitsPerCase * 100) / 100;
}
