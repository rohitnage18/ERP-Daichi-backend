import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryStockStore } from "./memory-stock-store";
import { TRACKING_ANOMALY_MINUTES, TRACKING_INTERVAL_MS, isLocationAnomaly } from "./tracking";

describe("Order stock reservation (memory model)", () => {
  it("blocks available qty without depleting on-hand; release then invoice deducts", () => {
    const store = new MemoryStockStore();
    store.register({ id: "p1", name: "Mag", sku: "MAG", unitsPerCase: 25, baseUnit: "Nos" }, 100);
    assert.equal(store.qty("p1"), 100);
    assert.equal(store.available("p1"), 100);

    store.reserve("p1", 40, "ord-1");
    assert.equal(store.qty("p1"), 100);
    assert.equal(store.reserved("p1"), 40);
    assert.equal(store.available("p1"), 60);

    assert.throws(() => store.reserve("p1", 70, "ord-2"), /available/i);

    store.release("p1", 40, "ord-1");
    assert.equal(store.available("p1"), 100);

    store.invoice([{ productId: "p1", qty: 40, unit: "NOS" }], "inv-1");
    assert.equal(store.qty("p1"), 60);
  });

  it("transfers between warehouses using available stock only", () => {
    const store = new MemoryStockStore();
    store.register({ id: "p1", name: "Mag", sku: "MAG", unitsPerCase: 25, baseUnit: "Nos" }, 50);
    store.reserve("p1", 10, "ord-1");
    assert.throws(() => store.transfer("p1", 45, "MAIN", "WH-2"), /available/i);
    store.transfer("p1", 20, "MAIN", "WH-2");
    assert.equal(store.qty("p1"), 50);
    assert.equal(store.warehouseQty("p1", "MAIN"), 30);
    assert.equal(store.warehouseQty("p1", "WH-2"), 20);
  });
});

describe("Tracking intervals (spec)", () => {
  it("uses 30 min ping interval and 2 hour anomaly", () => {
    assert.equal(TRACKING_INTERVAL_MS, 30 * 60 * 1000);
    assert.equal(TRACKING_ANOMALY_MINUTES, 120);
    const now = new Date("2026-09-21T14:00:00.000+05:30");
    assert.equal(isLocationAnomaly(new Date("2026-09-21T12:01:00.000+05:30"), now), false);
    assert.equal(isLocationAnomaly(new Date("2026-09-21T11:59:00.000+05:30"), now), true);
  });
});
