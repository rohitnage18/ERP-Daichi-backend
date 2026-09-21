import * as XLSX from "xlsx";

export type UploadRowInput = {
  sku?: unknown;
  productCode?: unknown;
  quantity?: unknown;
  qty?: unknown;
  warehouse?: unknown;
  warehouseCode?: unknown;
  unit?: unknown;
  unitOfMeasure?: unknown;
};

export type ParsedUploadRow = {
  row: number;
  sku: string;
  quantity: number;
  warehouseCode?: string;
  unit?: string;
};

export type UploadRowError = { row: number; sku?: string; error: string };

const VALID_UNITS = new Set(["nos", "kg", "gm", "ml", "ltr", "lit", "case", "box", "bag", "pkt"]);

function cell(row: Record<string, unknown>, ...keys: string[]): unknown {
  const map = new Map(Object.keys(row).map((k) => [k.trim().toLowerCase(), row[k]]));
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

export function normalizeUploadRow(raw: UploadRowInput, rowNumber: number): ParsedUploadRow | UploadRowError {
  const sku = String(cell(raw as Record<string, unknown>, "sku", "productcode", "product code", "code") ?? raw.sku ?? raw.productCode ?? "")
    .trim()
    .toUpperCase();
  const qtyRaw = cell(raw as Record<string, unknown>, "quantity", "qty", "stock", "on hand", "onhand") ?? raw.quantity ?? raw.qty;
  const warehouse = String(
    cell(raw as Record<string, unknown>, "warehouse", "warehousecode", "warehouse code") ?? raw.warehouse ?? raw.warehouseCode ?? ""
  ).trim();
  const unit = String(cell(raw as Record<string, unknown>, "unit", "uom", "unitofmeasure") ?? raw.unit ?? raw.unitOfMeasure ?? "")
    .trim()
    .toLowerCase();

  if (!sku) return { row: rowNumber, error: "SKU / product code is required" };
  const quantity = Number(qtyRaw);
  if (!Number.isFinite(quantity)) return { row: rowNumber, sku, error: "Quantity must be numeric" };
  if (quantity < 0) return { row: rowNumber, sku, error: "Quantity cannot be negative" };
  if (unit && !VALID_UNITS.has(unit)) {
    return { row: rowNumber, sku, error: `Invalid unit of measure: ${unit}` };
  }
  return {
    row: rowNumber,
    sku,
    quantity,
    warehouseCode: warehouse || undefined,
    unit: unit || undefined,
  };
}

export function parseSpreadsheet(buffer: Buffer, fileName: string): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export function parseCsvText(text: string): Record<string, unknown>[] {
  return parseSpreadsheet(Buffer.from(text, "utf8"), "upload.csv");
}

export function partitionUploadRows(rawRows: Record<string, unknown>[]): {
  valid: ParsedUploadRow[];
  errors: UploadRowError[];
} {
  const valid: ParsedUploadRow[] = [];
  const errors: UploadRowError[] = [];
  rawRows.forEach((raw, index) => {
    const result = normalizeUploadRow(raw, index + 2);
    if ("error" in result) errors.push(result);
    else valid.push(result);
  });
  return { valid, errors };
}
