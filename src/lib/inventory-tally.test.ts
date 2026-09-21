import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayCases, grandTotalCases, roundHalfUp, toBaseUnits } from "./stock-math";
import {
  TALLY_FINISHED_GOODS,
  REPLAY_A_TO_B,
  snapshotCases,
  tallyByKey,
} from "./tally-stock-fixtures";
import { MemoryStockStore } from "./memory-stock-store";
import { evaluateAvailability, normalizeStockLines, stockDiffLines, StockError } from "./inventory-stock";
import { ObjectId } from "mongodb";

describe("1. Unit conversion (Tally round half up)", () => {
  it("edge cases: 819/25→33, 705/25→28, 18/5→4, 8/5→2", () => {
    assert.equal(displayCases(819, 25), 33);
    assert.equal(displayCases(705, 25), 28);
    assert.equal(displayCases(18, 5), 4);
    assert.equal(displayCases(8, 5), 2);
    assert.equal(roundHalfUp(1.5), 2);
  });

  it("Snapshot A display cases and grand total 1,797", () => {
    assert.equal(snapshotCases("snapshotA"), 1797);
  });

  it("Snapshot B display cases and grand total 1,737", () => {
    assert.equal(snapshotCases("snapshotB"), 1737);
  });

  it("Inwards line cases sum (Mag UPC=25) matches computed grand total", () => {
    const total = snapshotCases("inwards");
    // Spec text said 2,675; with Magasium Sulphate at 25 KG/case the math is 2,526.
    assert.equal(total, 2526);
    assert.equal(
      grandTotalCases(TALLY_FINISHED_GOODS.map((r) => ({ baseQty: r.inwards, unitsPerCase: r.unitsPerCase }))),
      2526
    );
  });

  it("Case → base conversion", () => {
    assert.equal(toBaseUnits(2, "CASE", 6), 12);
    assert.equal(toBaseUnits(40, "CASE", 25), 1000);
    assert.equal(toBaseUnits(50, "NOS", 25), 50);
    assert.equal(toBaseUnits(3, "NOS", 3), 3);
  });
});

describe("2–10. Ledger store behaviour (Tally fixtures)", () => {
  function seedSnapshotA(): MemoryStockStore {
    const store = new MemoryStockStore();
    for (const row of TALLY_FINISHED_GOODS) {
      store.register(
        {
          id: row.key,
          name: row.tallyName,
          sku: row.productCode,
          unitsPerCase: row.unitsPerCase,
          baseUnit: row.baseUnit,
        },
        row.snapshotA
      );
    }
    return store;
  }

  it("2. Load Snapshot A — every line + 1,797-case total", () => {
    const store = seedSnapshotA();
    for (const row of TALLY_FINISHED_GOODS) {
      assert.equal(store.qty(row.key), row.snapshotA, row.key);
    }
    assert.equal(store.grandTotal(), 1797);
    assert.ok(store.movements.every((m) => m.type === "OPENING"));
  });

  it("3. Invoice replay A → B equals Snapshot B and 1,737 cases", () => {
    const store = seedSnapshotA();
    for (const line of REPLAY_A_TO_B) {
      const sku = tallyByKey(line.key);
      assert.equal(toBaseUnits(line.entryQty, line.entryUnit, sku.unitsPerCase), line.baseUnits);
    }
    store.invoice(
      REPLAY_A_TO_B.map((l) => ({ productId: l.key, qty: l.entryQty, unit: l.entryUnit })),
      "INV-REPLAY"
    );
    for (const row of TALLY_FINISHED_GOODS) {
      assert.equal(store.qty(row.key), row.snapshotB, `${row.key} expected Snapshot B`);
    }
    assert.equal(store.grandTotal(), 1737);
  });

  it("4. Insufficient stock rejects and leaves qty unchanged", () => {
    const store = seedSnapshotA();
    // After replay would be 8; on Snapshot A there are 18 Nos of 12:61:00 5Kg
    const before = store.qty("npk-126100-5kg");
    assert.throws(
      () => store.invoice([{ productId: "npk-126100-5kg", qty: 100, unit: "NOS" }], "INV-FAIL"),
      /Only 18 Nos available for Indicafert NPK 12:61:00 - 5 Kg/
    );
    assert.equal(store.qty("npk-126100-5kg"), before);
  });

  it("5. Atomicity — failing line 3 leaves lines 1–2 undeducted", () => {
    const store = seedSnapshotA();
    const a = store.qty("npk-000946-2.5kg");
    const b = store.qty("npk-000946-5kg");
    const c = store.qty("npk-126100-5kg");
    assert.throws(() =>
      store.invoice(
        [
          { productId: "npk-000946-2.5kg", qty: 1, unit: "CASE" },
          { productId: "npk-000946-5kg", qty: 1, unit: "NOS" },
          { productId: "npk-126100-5kg", qty: 100, unit: "NOS" },
        ],
        "INV-ATOMIC"
      )
    );
    assert.equal(store.qty("npk-000946-2.5kg"), a);
    assert.equal(store.qty("npk-000946-5kg"), b);
    assert.equal(store.qty("npk-126100-5kg"), c);
  });

  it("6. Cancel restores exact quantities", () => {
    const store = seedSnapshotA();
    store.invoice(
      REPLAY_A_TO_B.map((l) => ({ productId: l.key, qty: l.entryQty, unit: l.entryUnit })),
      "INV-CANCEL"
    );
    store.cancelInvoice("INV-CANCEL");
    for (const row of TALLY_FINISHED_GOODS) {
      assert.equal(store.qty(row.key), row.snapshotA, row.key);
    }
    assert.equal(store.grandTotal(), 1797);
  });

  it("7. Edit invoice 5→3 cases restores 2 cases only", () => {
    const store = seedSnapshotA();
    const key = "npk-000946-2.5kg";
    const upc = tallyByKey(key).unitsPerCase; // 6
    store.invoice([{ productId: key, qty: 5, unit: "CASE" }], "INV-EDIT");
    const after5 = store.qty(key);
    assert.equal(after5, tallyByKey(key).snapshotA - 5 * upc);
    store.editInvoice(
      "INV-EDIT",
      [{ productId: key, base: 5 * upc }],
      [{ productId: key, base: 3 * upc }]
    );
    assert.equal(store.qty(key), tallyByKey(key).snapshotA - 3 * upc);
    assert.equal(store.qty(key) - after5, 2 * upc);
  });

  it("8. Concurrency — exactly one of two invoices for last stock succeeds", async () => {
    const store = new MemoryStockStore();
    store.register(
      {
        id: "last",
        name: "Last Bag",
        sku: "LAST",
        unitsPerCase: 1,
        baseUnit: "Nos",
      },
      10
    );
    const results = await Promise.allSettled([
      store.invoiceConcurrent([{ productId: "last", qty: 10, unit: "NOS" }], "A"),
      store.invoiceConcurrent([{ productId: "last", qty: 10, unit: "NOS" }], "B"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    assert.equal(ok, 1);
    assert.equal(fail, 1);
    assert.equal(store.qty("last"), 0);
  });

  it("9. Add inventory — 10 cases Thio Cal 1 Ltr → +100 Nos + INWARD ledger", () => {
    const store = seedSnapshotA();
    const key = "thiocal-1ltr";
    const before = store.qty(key);
    const added = store.inward(key, 10, "CASE", "INWARD-1");
    assert.equal(added, 100);
    assert.equal(store.qty(key), before + 100);
    const last = store.movements.filter((m) => m.type === "INWARD").at(-1);
    assert.equal(last?.qtyChange, 100);
    assert.equal(last?.productId, key);
  });

  it("10. Inwards reconciliation: opening 0 + INWARD − invoices = Snapshot B", () => {
    const store = new MemoryStockStore();
    for (const row of TALLY_FINISHED_GOODS) {
      store.register({
        id: row.key,
        name: row.tallyName,
        sku: row.productCode,
        unitsPerCase: row.unitsPerCase,
        baseUnit: row.baseUnit,
      });
      store.inward(row.key, row.inwards, "NOS", "INWARDS");
    }
    assert.equal(store.grandTotal(), 2526);

    const invoiceLines = TALLY_FINISHED_GOODS.filter((r) => r.inwards - r.snapshotB > 0).map((r) => ({
      productId: r.key,
      qty: r.inwards - r.snapshotB,
      unit: "NOS" as const,
    }));
    store.invoice(invoiceLines, "INV-FROM-INWARDS");

    for (const row of TALLY_FINISHED_GOODS) {
      assert.equal(store.qty(row.key), row.snapshotB, row.key);
    }
    assert.equal(store.grandTotal(), 1737);
  });
});

describe("inventory-stock helpers", () => {
  it("normalizeStockLines merges duplicates and converts Case", () => {
    const id = new ObjectId();
    const lines = normalizeStockLines([
      { productId: id, quantity: 2, unit: "CASE", unitsPerCase: 5 },
      { productId: id.toString(), quantity: 3, unit: "NOS" },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 13);
  });

  it("evaluateAvailability uses Only X Nos available wording", () => {
    const id = new ObjectId();
    const result = evaluateAvailability(
      [{ productId: id, quantity: 100, name: "Widget" }],
      new Map([[id.toString(), { quantity: 8, name: "Widget", baseUnit: "Nos" }]])
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /Only 8 Nos available for Widget/);
    }
  });

  it("stockDiffLines computes edit deltas", () => {
    const id = new ObjectId();
    const diffs = stockDiffLines(
      [{ productId: id, quantity: 30 }],
      [{ productId: id, quantity: 18 }]
    );
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].quantity, -12);
  });

  it("StockError is 400-class", () => {
    const err = new StockError("boom");
    assert.equal(err.status, 400);
  });
});
