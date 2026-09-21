/**
 * In-memory stock ledger for automated tests (no Mongo required).
 * Mirrors production rules: base units, ledger types, atomic multi-line deduct.
 */
import { displayCases, grandTotalCases, toBaseUnits, type QtyUnit } from "./stock-math";
import { shortageMessage } from "./inventory-stock";

export type MemMovementType = "OPENING" | "INWARD" | "INVOICE" | "INVOICE_CANCEL" | "ADJUSTMENT";

export type MemProduct = {
  id: string;
  name: string;
  sku: string;
  unitsPerCase: number;
  baseUnit: "Nos" | "KG";
};

export type MemMovement = {
  productId: string;
  qtyChange: number;
  type: MemMovementType;
  referenceId?: string;
  createdAt: Date;
  user?: string;
  notes?: string;
};

export class MemoryStockStore {
  products = new Map<string, MemProduct>();
  /** Cached current stock in base units (kept in sync with movements). */
  stock = new Map<string, number>();
  reservedMap = new Map<string, number>();
  warehouses = new Map<string, Map<string, number>>();
  movements: MemMovement[] = [];
  private locks = new Map<string, Promise<void>>();

  register(product: MemProduct, opening = 0) {
    this.products.set(product.id, product);
    this.stock.set(product.id, 0);
    this.reservedMap.set(product.id, 0);
    if (opening !== 0) {
      this.post(product.id, opening, "OPENING", "opening");
      this.setWarehouse(product.id, "MAIN", opening);
    }
  }

  qty(productId: string): number {
    return this.stock.get(productId) ?? 0;
  }

  reservedQty(productId: string): number {
    return this.reservedMap.get(productId) ?? 0;
  }

  /** Alias used by tests. */
  reserved(productId: string): number {
    return this.reservedQty(productId);
  }

  available(productId: string): number {
    return Math.max(0, this.qty(productId) - this.reservedQty(productId));
  }

  warehouseQty(productId: string, code: string): number {
    return this.warehouses.get(code)?.get(productId) ?? 0;
  }

  private setWarehouse(productId: string, code: string, qty: number) {
    if (!this.warehouses.has(code)) this.warehouses.set(code, new Map());
    this.warehouses.get(code)!.set(productId, qty);
  }

  reserve(productId: string, qty: number, orderId: string) {
    if (this.available(productId) < qty) {
      throw new Error(`Only ${this.available(productId)} available (cannot reserve)`);
    }
    this.reservedMap.set(productId, this.reservedQty(productId) + qty);
    this.movements.push({
      productId,
      qtyChange: 0,
      type: "ADJUSTMENT",
      referenceId: orderId,
      createdAt: new Date(),
      notes: `Reserved ${qty}`,
    });
  }

  release(productId: string, qty: number, orderId: string) {
    this.reservedMap.set(productId, Math.max(0, this.reservedQty(productId) - qty));
    this.movements.push({
      productId,
      qtyChange: 0,
      type: "ADJUSTMENT",
      referenceId: orderId,
      createdAt: new Date(),
      notes: `Released ${qty}`,
    });
  }

  transfer(productId: string, qty: number, from: string, to: string) {
    if (from === to) throw new Error("from and to must differ");
    if (this.available(productId) < qty) {
      throw new Error(`Only ${this.available(productId)} available to transfer`);
    }
    const fromCur = this.warehouseQty(productId, from) || this.qty(productId);
    if (fromCur < qty) {
      throw new Error(`Only ${fromCur} available to transfer`);
    }
    this.setWarehouse(productId, from, fromCur - qty);
    this.setWarehouse(productId, to, this.warehouseQty(productId, to) + qty);
    this.movements.push({
      productId,
      qtyChange: 0,
      type: "ADJUSTMENT",
      referenceId: `xfer-${from}-${to}`,
      createdAt: new Date(),
      notes: `Transfer ${qty} ${from}→${to}`,
    });
  }

  displayCasesFor(productId: string): number {
    const p = this.products.get(productId)!;
    return displayCases(this.qty(productId), p.unitsPerCase);
  }

  grandTotal(): number {
    return grandTotalCases(
      [...this.products.values()].map((p) => ({
        baseQty: this.qty(p.id),
        unitsPerCase: p.unitsPerCase,
      }))
    );
  }

  private post(
    productId: string,
    qtyChange: number,
    type: MemMovementType,
    referenceId?: string,
    user?: string,
    notes?: string
  ) {
    const next = (this.stock.get(productId) ?? 0) + qtyChange;
    if (next < 0) {
      const p = this.products.get(productId);
      throw new Error(shortageMessage(p?.name || productId, this.qty(productId), p?.baseUnit));
    }
    this.stock.set(productId, next);
    this.movements.push({
      productId,
      qtyChange,
      type,
      referenceId,
      createdAt: new Date(),
      user,
      notes,
    });
  }

  inward(productId: string, qty: number, unit: QtyUnit | string, referenceId?: string) {
    const p = this.products.get(productId)!;
    const base = toBaseUnits(qty, unit, p.unitsPerCase);
    this.post(productId, base, "INWARD", referenceId);
    return base;
  }

  /** Multi-line invoice deduct — all or nothing. */
  invoice(lines: { productId: string; qty: number; unit: QtyUnit | string }[], referenceId: string) {
    const normalized = lines.map((l) => {
      const p = this.products.get(l.productId)!;
      return { productId: l.productId, base: toBaseUnits(l.qty, l.unit, p.unitsPerCase), product: p };
    });
    for (const line of normalized) {
      if (this.qty(line.productId) < line.base) {
        throw new Error(
          shortageMessage(line.product.name, this.qty(line.productId), line.product.baseUnit)
        );
      }
    }
    for (const line of normalized) {
      this.post(line.productId, -line.base, "INVOICE", referenceId);
    }
  }

  cancelInvoice(referenceId: string) {
    const related = this.movements.filter((m) => m.referenceId === referenceId && m.type === "INVOICE");
    for (const m of related) {
      this.post(m.productId, -m.qtyChange, "INVOICE_CANCEL", referenceId);
    }
  }

  /** Edit: apply only the difference vs previous invoice lines (base units). */
  editInvoice(
    referenceId: string,
    previous: { productId: string; base: number }[],
    next: { productId: string; base: number }[]
  ) {
    const map = new Map<string, number>();
    for (const n of next) map.set(n.productId, (map.get(n.productId) || 0) + n.base);
    for (const p of previous) map.set(p.productId, (map.get(p.productId) || 0) - p.base);
    const deduct: { productId: string; base: number }[] = [];
    const restore: { productId: string; base: number }[] = [];
    for (const [productId, delta] of map) {
      if (delta > 0) deduct.push({ productId, base: delta });
      if (delta < 0) restore.push({ productId, base: -delta });
    }
    for (const d of deduct) {
      if (this.qty(d.productId) < d.base) {
        const p = this.products.get(d.productId)!;
        throw new Error(shortageMessage(p.name, this.qty(d.productId), p.baseUnit));
      }
    }
    for (const d of deduct) this.post(d.productId, -d.base, "INVOICE", referenceId);
    for (const r of restore) this.post(r.productId, r.base, "INVOICE_CANCEL", referenceId);
  }

  /** Serialize concurrent invoices that compete for the same SKUs. */
  async invoiceConcurrent(
    lines: { productId: string; qty: number; unit: QtyUnit | string }[],
    referenceId: string
  ): Promise<void> {
    const keys = [...new Set(lines.map((l) => l.productId))].sort();
    const gateKey = keys.join("|");
    const prev = this.locks.get(gateKey) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      gateKey,
      prev.then(() => next)
    );
    await prev;
    try {
      this.invoice(lines, referenceId);
    } finally {
      release();
    }
  }
}
