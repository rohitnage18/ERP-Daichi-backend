import { dateKeyIST, dayStartIST } from "./dates-ist";

export type DailyActivityInput = {
  reportDate?: string;
  placesToVisit?: unknown;
  salesTarget?: unknown;
  collectionTarget?: unknown;
  newDealerAppointmentPlan?: unknown;
  demonstrationPlan?: unknown;
  farmerMeetingPlan?: unknown;
  openingOdometer?: unknown;
};

export type FarmerVisitInput = {
  name?: unknown;
  location?: unknown;
  notes?: unknown;
};

export type DealerVisitInput = {
  dealerId?: unknown;
  dealerName?: unknown;
};

export type DailyClosingInput = {
  reportDate?: string;
  closingOdometer?: unknown;
  placesVisited?: unknown;
  dealersVisited?: unknown;
  salesAchievement?: unknown;
  collectionAchievement?: unknown;
  newDealerAppointment?: {
    dealerId?: unknown;
    dealerName?: unknown;
    details?: unknown;
  };
  farmersVisited?: unknown;
  otherWork?: unknown;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function asMoney(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function asOdometer(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function normalizeActivity(input: DailyActivityInput) {
  return {
    placesToVisit: asStringList(input.placesToVisit),
    salesTarget: asMoney(input.salesTarget) ?? 0,
    collectionTarget: asMoney(input.collectionTarget) ?? 0,
    newDealerAppointmentPlan: asStringList(input.newDealerAppointmentPlan),
    demonstrationPlan: asStringList(input.demonstrationPlan),
    farmerMeetingPlan: asStringList(input.farmerMeetingPlan),
    openingOdometer: asOdometer(input.openingOdometer) ?? undefined,
  };
}

export function normalizeClosing(input: DailyClosingInput) {
  const dealersVisited = Array.isArray(input.dealersVisited)
    ? (input.dealersVisited
        .map((row) => {
          const r = row as DealerVisitInput;
          const dealerName = String(r?.dealerName || "").trim();
          const dealerId = String(r?.dealerId || "").trim();
          if (!dealerName && !dealerId) return null;
          return { dealerId: dealerId || undefined, dealerName: dealerName || dealerId };
        })
        .filter(Boolean) as { dealerId?: string; dealerName: string }[])
    : [];

  const farmersVisited = Array.isArray(input.farmersVisited)
    ? (input.farmersVisited
        .map((row) => {
          const r = row as FarmerVisitInput;
          const name = String(r?.name || "").trim();
          if (!name) return null;
          return {
            name,
            location: String(r?.location || "").trim() || undefined,
            notes: String(r?.notes || "").trim() || undefined,
          };
        })
        .filter(Boolean) as { name: string; location?: string; notes?: string }[])
    : [];

  const details = String(input.newDealerAppointment?.details || "").trim();
  const dealerName = String(input.newDealerAppointment?.dealerName || "").trim();
  const dealerId = String(input.newDealerAppointment?.dealerId || "").trim();

  return {
    placesVisited: asStringList(input.placesVisited),
    dealersVisited,
    salesAchievement: asMoney(input.salesAchievement) ?? 0,
    collectionAchievement: asMoney(input.collectionAchievement) ?? 0,
    newDealerAppointment:
      details || dealerName || dealerId
        ? {
            dealerId: dealerId || undefined,
            dealerName: dealerName || undefined,
            details: details || dealerName,
          }
        : undefined,
    farmersVisited,
    otherWork: String(input.otherWork || "").trim() || undefined,
    closingOdometer: asOdometer(input.closingOdometer) ?? undefined,
  };
}

export function validateActivity(input: DailyActivityInput, opts: { isAdmin: boolean; now?: Date }) {
  const errors: string[] = [];
  const now = opts.now || new Date();
  const dateRaw = input.reportDate || now.toISOString();
  const key = dateKeyIST(dateRaw);
  if (!key) errors.push("Report date is required.");
  if (!opts.isAdmin && key && key !== dateKeyIST(now)) {
    errors.push("Report date must be today.");
  }
  const data = normalizeActivity(input);
  if (data.placesToVisit.length === 0) errors.push("Add at least one place to visit.");
  if (asMoney(input.salesTarget) == null) errors.push("Sales target must be a number.");
  if (asMoney(input.collectionTarget) == null) errors.push("Collection target must be a number.");
  return { errors, dateKey: key, reportDate: key ? dayStartIST(dateRaw) : null, data };
}

export function validateClosing(
  input: DailyClosingInput,
  opts: { openingOdometer?: number | null; now?: Date }
) {
  const errors: string[] = [];
  const data = normalizeClosing(input);
  if (data.placesVisited.length === 0) errors.push("Add at least one place visited.");
  if (asMoney(input.salesAchievement) == null) errors.push("Sales achievement must be a number.");
  if (asMoney(input.collectionAchievement) == null) errors.push("Collection achievement must be a number.");
  if (data.closingOdometer == null) errors.push("Closing odometer reading is required.");
  if (
    data.closingOdometer != null &&
    opts.openingOdometer != null &&
    data.closingOdometer < opts.openingOdometer
  ) {
    errors.push("Closing odometer must be greater than or equal to opening odometer.");
  }
  return { errors, data };
}

export const MISSING_ACTIVITY_MESSAGE = "Submit today's Daily Activity Report first.";
export const ACTIVITY_EXISTS_MESSAGE = "Today's Daily Activity Report already exists. Update it instead.";
export const CLOSING_EXISTS_MESSAGE = "Today's Daily Closing Report is already submitted.";
