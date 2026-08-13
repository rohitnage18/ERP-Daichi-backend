import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveCasePrice, deriveLotSize, isPositiveInteger } from "./packing-math";

describe("units-per-case math", () => {
  it("5kg × 3 units = 15 kg", () => {
    const lot = deriveLotSize(5, "kg", 3);
    assert.equal(lot?.value, 15);
    assert.equal(lot?.unit, "kg");
    assert.equal(lot?.label, "15 kg");
  });

  it("changing 5kg unitsPerCase 3 → 5 updates lotSize 15kg → 25kg", () => {
    assert.equal(deriveLotSize(5, "kg", 3)?.label, "15 kg");
    assert.equal(deriveLotSize(5, "kg", 5)?.label, "25 kg");
  });

  it("casePrice scales with unitsPerCase once price is set", () => {
    assert.equal(deriveCasePrice(100, 3), 300);
    assert.equal(deriveCasePrice(100, 5), 500);
    assert.equal(deriveCasePrice(null, 3), null);
  });

  it("rejects non-positive / non-integer unitsPerCase", () => {
    assert.equal(isPositiveInteger(0), false);
    assert.equal(isPositiveInteger(-1), false);
    assert.equal(isPositiveInteger(3.5), false);
    assert.equal(isPositiveInteger(3), true);
    assert.equal(deriveLotSize(5, "kg", 0), null);
  });

  it("250gm × 40 = 10 kg", () => {
    assert.equal(deriveLotSize(250, "gm", 40)?.label, "10 kg");
  });
});
