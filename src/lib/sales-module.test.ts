import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { evaluateAvailability, normalizeStockLines, StockError } from "./inventory-stock";
import { normalizeUploadRow, partitionUploadRows } from "./inventory-upload";
import { canAcceptLivePing, isLocationAnomaly, isWithinWorkingHours } from "./tracking";

describe("invoice stock deduction rules", () => {
  it("merges duplicate SKU lines before checking stock", () => {
    const id = new ObjectId();
    const lines = normalizeStockLines([
      { productId: id, quantity: 4 },
      { productId: id.toString(), quantity: 6 },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 10);
  });

  it("blocks when available quantity is below invoiced quantity", () => {
    const id = new ObjectId();
    const result = evaluateAvailability(
      [{ productId: id, quantity: 5, name: "NPK" }],
      new Map([[id.toString(), { quantity: 2, sku: "NPK-01", name: "NPK" }]])
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Only 2 Nos available for NPK/);
  });

  it("allows when stock is sufficient", () => {
    const id = new ObjectId();
    const result = evaluateAvailability(
      [{ productId: id, quantity: 5 }],
      new Map([[id.toString(), { quantity: 5, sku: "NPK-01" }]])
    );
    assert.equal(result.ok, true);
  });

  it("StockError is a 400-class business error", () => {
    const err = new StockError("Only 2 Nos available for NPK");
    assert.equal(err.status, 400);
  });
});

describe("inventory upload row validation", () => {
  it("accepts a valid SKU row", () => {
    const row = normalizeUploadRow({ sku: "NPK-01", quantity: 12, unit: "kg" }, 2);
    assert.equal("error" in row, false);
    if (!("error" in row)) {
      assert.equal(row.sku, "NPK-01");
      assert.equal(row.quantity, 12);
    }
  });

  it("reports row-level errors and keeps valid rows", () => {
    const { valid, errors } = partitionUploadRows([
      { sku: "OK-1", quantity: 10 },
      { sku: "BAD", quantity: -3 },
      { sku: "", quantity: 1 },
      { ProductCode: "OK-2", Qty: 4 },
    ]);
    assert.equal(valid.length, 2);
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => /negative/i.test(e.error)));
  });
});

describe("live tracking windows", () => {
  it("rejects pings without consent or an active session", () => {
    const noon = new Date("2026-09-15T12:00:00.000+05:30");
    assert.equal(canAcceptLivePing({ consented: false, sessionActive: true, now: noon }).ok, false);
    assert.equal(canAcceptLivePing({ consented: true, sessionActive: false, now: noon }).ok, false);
    assert.equal(canAcceptLivePing({ consented: true, sessionActive: true, now: noon }).ok, true);
  });

  it("rejects live pings outside 9:00–20:00 IST", () => {
    const night = new Date("2026-09-15T21:30:00.000+05:30");
    assert.equal(isWithinWorkingHours(night), false);
    assert.equal(canAcceptLivePing({ consented: true, sessionActive: true, now: night }).ok, false);
  });

  it("flags a 2+ hour gap as an anomaly", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    assert.equal(isLocationAnomaly(new Date(now.getTime() - 121 * 60 * 1000), now), true);
    assert.equal(isLocationAnomaly(new Date(now.getTime() - 60 * 60 * 1000), now), false);
    assert.equal(isLocationAnomaly(null, now), true);
  });
});
