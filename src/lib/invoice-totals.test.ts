import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payableInvoiceTotals } from "./utils";

describe("payableInvoiceTotals freight less", () => {
  it("2000 goods minus 200 freight is 1800 for any matching prices", () => {
    const payable = payableInvoiceTotals({
      subtotal: 2000,
      totalTax: 0,
      freightCharges: 200,
    });
    assert.equal(payable.goodsTotal, 2000);
    assert.equal(payable.totalAmount, 1800);
  });

  it("1995+GST rounded 2095 minus freight 200 is 1895", () => {
    const payable = payableInvoiceTotals({
      subtotal: 1995,
      totalTax: 99.76,
      freightCharges: 200,
    });
    assert.equal(payable.goodsTotal, 2095);
    assert.equal(payable.totalAmount, 1895);
  });

  it("7560 goods+GST minus 200 freight is 7360", () => {
    const payable = payableInvoiceTotals({
      subtotal: 7200,
      totalTax: 360,
      cgstAmount: 180,
      sgstAmount: 180,
      igstAmount: 0,
      freightCharges: 200,
    });
    assert.equal(payable.totalAmount, 7360);
    assert.equal(payable.roundOff, 0);
  });

  it("treats missing freight as zero", () => {
    const payable = payableInvoiceTotals({ subtotal: 100, totalTax: 5 });
    assert.equal(payable.totalAmount, 105);
  });

  it("never goes below zero when freight exceeds goods total", () => {
    const payable = payableInvoiceTotals({
      subtotal: 50,
      totalTax: 0,
      freightCharges: 200,
    });
    assert.equal(payable.totalAmount, 0);
  });

  it("ignores negative freight so the payable is not increased", () => {
    const payable = payableInvoiceTotals({
      subtotal: 1000,
      totalTax: 50,
      freightCharges: -80,
    });
    assert.equal(payable.totalAmount, 1050);
  });

  it("fuzz: freight never increases the total (200 random cases)", () => {
    for (let i = 0; i < 200; i++) {
      const subtotal = Math.round(Math.random() * 1e6);
      const tax = Math.round(Math.random() * 1e5);
      const freightRaw = i % 17 === 0 ? -Math.round(Math.random() * 1e4) : Math.round(Math.random() * 1e5);
      const payable = payableInvoiceTotals({
        subtotal,
        totalTax: tax,
        freightCharges: freightRaw,
      });
      const goods = Math.round(subtotal + tax);
      const freight = Math.max(0, freightRaw);
      assert.equal(payable.totalAmount, Math.max(0, goods - freight));
      assert.ok(payable.totalAmount >= 0);
      assert.ok(payable.totalAmount <= goods);
    }
  });

  it("performance: 10k totals stay under 50ms", () => {
    const started = Date.now();
    for (let i = 0; i < 10_000; i++) {
      payableInvoiceTotals({
        subtotal: 7200 + (i % 97),
        totalTax: 360,
        freightCharges: i % 200,
      });
    }
    assert.ok(Date.now() - started < 50);
  });
});
