import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_EXISTS_MESSAGE,
  MISSING_ACTIVITY_MESSAGE,
  validateActivity,
  validateClosing,
} from "./daily-reports";
import { dateKeyIST, dayStartIST } from "./dates-ist";

describe("Daily Activity Report validation", () => {
  const today = new Date("2026-09-15T08:00:00.000+05:30");

  it("accepts a complete activity report for today", () => {
    const result = validateActivity(
      {
        reportDate: "2026-09-15",
        placesToVisit: ["Pune", "Nashik"],
        salesTarget: 50000,
        collectionTarget: 20000,
        newDealerAppointmentPlan: ["Meet Sharma Traders"],
        demonstrationPlan: ["NPK demo"],
        farmerMeetingPlan: ["Village hall 4pm"],
        openingOdometer: 12010,
      },
      { isAdmin: false, now: today }
    );
    assert.deepEqual(result.errors, []);
    assert.equal(result.data.placesToVisit.length, 2);
    assert.equal(result.data.salesTarget, 50000);
    assert.equal(dateKeyIST(result.reportDate!), "2026-09-15");
  });

  it("rejects a second-day date for non-admin", () => {
    const result = validateActivity(
      {
        reportDate: "2026-09-14",
        placesToVisit: ["Pune"],
        salesTarget: 1,
        collectionTarget: 1,
        openingOdometer: 100,
      },
      { isAdmin: false, now: today }
    );
    assert.ok(result.errors.some((e) => e.includes("today")));
  });

  it("allows admin to pick another date", () => {
    const result = validateActivity(
      {
        reportDate: "2026-09-14",
        placesToVisit: ["Pune"],
        salesTarget: 1,
        collectionTarget: 0,
        openingOdometer: 100,
      },
      { isAdmin: true, now: today }
    );
    assert.deepEqual(result.errors, []);
  });

  it("rejects missing required fields", () => {
    const result = validateActivity(
      { reportDate: "2026-09-15", placesToVisit: [], salesTarget: "abc", collectionTarget: -1 },
      { isAdmin: false, now: today }
    );
    assert.ok(result.errors.length >= 2);
  });
});

describe("Daily Closing Report validation", () => {
  it("blocks when activity is missing (message constant)", () => {
    assert.equal(MISSING_ACTIVITY_MESSAGE, "Submit today's Daily Activity Report first.");
    assert.match(ACTIVITY_EXISTS_MESSAGE, /already submitted and locked/i);
  });

  it("requires opening odometer on activity", () => {
    const today = new Date("2026-09-15T08:00:00.000+05:30");
    const result = validateActivity(
      {
        reportDate: "2026-09-15",
        placesToVisit: ["Pune"],
        salesTarget: 1,
        collectionTarget: 1,
      },
      { isAdmin: false, now: today }
    );
    assert.ok(result.errors.some((e) => /Opening odometer/i.test(e)));
  });

  it("makeReportCode formats DAR/DCR ids", async () => {
    const { makeReportCode } = await import("./daily-reports");
    const id = makeReportCode("DAR", new Date("2026-09-21T00:00:00.000+05:30"), "abcdef123456");
    assert.equal(id, "DAR-20260921-123456");
  });

  it("accepts a complete closing report", () => {
    const result = validateClosing(
      {
        closingOdometer: 12100,
        placesVisited: ["Pune"],
        dealersVisited: [{ dealerName: "Sharma Traders" }],
        salesAchievement: 45000,
        collectionAchievement: 18000,
        farmersVisited: [{ name: "Ramesh", location: "Khed", notes: "NPK interest" }],
        otherWork: "Follow-up calls",
      },
      { openingOdometer: 12010 }
    );
    assert.deepEqual(result.errors, []);
    assert.equal(result.data.closingOdometer, 12100);
  });

  it("rejects closing odometer below opening", () => {
    const result = validateClosing(
      {
        closingOdometer: 100,
        placesVisited: ["Pune"],
        salesAchievement: 0,
        collectionAchievement: 0,
      },
      { openingOdometer: 200 }
    );
    assert.ok(result.errors.some((e) => /odometer/i.test(e)));
  });
});

describe("IST day keys", () => {
  it("keeps 15 Sep IST as 2026-09-15 even late evening UTC", () => {
    assert.equal(dateKeyIST(new Date("2026-09-15T20:30:00.000+05:30")), "2026-09-15");
    assert.equal(dayStartIST("2026-09-15").getTime(), new Date("2026-09-15T00:00:00.000+05:30").getTime());
  });
});
