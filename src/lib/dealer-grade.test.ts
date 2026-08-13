import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gradeFromCreditLimit } from "./dealer-grade";

describe("dealer credit grading", () => {
  it("₹5,00,000 → A", () => assert.equal(gradeFromCreditLimit(500000), "A"));
  it("₹4,99,999 → B", () => assert.equal(gradeFromCreditLimit(499999), "B"));
  it("₹4,00,000 → B", () => assert.equal(gradeFromCreditLimit(400000), "B"));
  it("₹3,99,999 → C", () => assert.equal(gradeFromCreditLimit(399999), "C"));
  it("₹3,00,000 → C", () => assert.equal(gradeFromCreditLimit(300000), "C"));
  it("₹2,00,000 → D", () => assert.equal(gradeFromCreditLimit(200000), "D"));
  it("₹1,99,999 → Ungraded", () => assert.equal(gradeFromCreditLimit(199999), "UNGRADED"));
  it("invalid / missing → Ungraded", () => {
    assert.equal(gradeFromCreditLimit(null), "UNGRADED");
    assert.equal(gradeFromCreditLimit(""), "UNGRADED");
  });
});
