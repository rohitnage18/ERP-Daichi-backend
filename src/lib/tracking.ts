import { istMinutesOfDay } from "./dates-ist";

/** Field tracking window in IST. Inclusive start, exclusive end. */
export const TRACKING_START_MINUTES = 9 * 60;
export const TRACKING_END_MINUTES = 20 * 60;
export const TRACKING_INTERVAL_MS = 3 * 60 * 1000;
export const TRACKING_ANOMALY_MINUTES = 15;

export function isWithinWorkingHours(now = new Date()): boolean {
  const mins = istMinutesOfDay(now);
  return mins >= TRACKING_START_MINUTES && mins < TRACKING_END_MINUTES;
}

export function canAcceptLivePing(opts: {
  consented: boolean;
  sessionActive: boolean;
  now?: Date;
}): { ok: boolean; error?: string } {
  if (!opts.consented) return { ok: false, error: "Location tracking consent is required." };
  if (!opts.sessionActive) return { ok: false, error: "Start tracking / check in before sending location." };
  if (!isWithinWorkingHours(opts.now)) {
    return { ok: false, error: "Live tracking is only active during working hours (9:00–20:00 IST)." };
  }
  return { ok: true };
}

export function isLocationAnomaly(lastPingAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastPingAt) return true;
  const gapMs = now.getTime() - lastPingAt.getTime();
  return gapMs >= TRACKING_ANOMALY_MINUTES * 60 * 1000;
}

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
