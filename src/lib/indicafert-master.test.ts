import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INDICAFERT_MASTER, MASTER_PRODUCT_CODES } from "./indicafert-master";

describe("approved product master", () => {
  it("has exactly 75 unique packing SKUs", () => {
    const codes = INDICAFERT_MASTER.flatMap((p) => p.packings.map((pk) => pk.productCode));
    assert.equal(codes.length, 75);
    assert.equal(MASTER_PRODUCT_CODES.size, 75);
    assert.equal(new Set(codes).size, 75);
  });

  it("has 35 products across the five approved categories", () => {
    assert.equal(INDICAFERT_MASTER.length, 35);
  });
});
