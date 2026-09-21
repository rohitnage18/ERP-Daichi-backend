/** India-calendar helpers so field reports are not shifted by UTC midnight on Render. */

export function dateKeyIST(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dayStartIST(value: Date | string = new Date()): Date {
  const key = dateKeyIST(value);
  return new Date(`${key}T00:00:00.000+05:30`);
}

export function dayEndIST(value: Date | string = new Date()): Date {
  const key = dateKeyIST(value);
  return new Date(`${key}T23:59:59.999+05:30`);
}

export function istMinutesOfDay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}
