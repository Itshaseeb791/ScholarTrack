// All calendar-day logic lives here. Date-only values ("2026-11-13") are plain calendar days and are
// never converted through a timezone; timestamps are converted to a calendar day in the app timezone.
// Everything is computed on the server, so rendering and hydration cannot disagree.
export const DEFAULT_TIMEZONE = "Asia/Karachi";
const DAY = 86_400_000;

// ponytail: one app-wide zone from APP_TIMEZONE; move it to a settings table for per-user zones.
export function getTimezone(): string {
  const zone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); return zone; } catch { return DEFAULT_TIMEZONE; }
}

/** Calendar day (YYYY-MM-DD) of an instant in the given zone. en-CA formats as ISO. */
export function dateInZone(instant: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

export const todayIn = (timeZone = DEFAULT_TIMEZONE, now: Date = new Date()) => dateInZone(now, timeZone);

/** Whole calendar days from `from` to `to`; both are date-only, so UTC arithmetic cannot shift them. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);

/** Formats a date-only value without any timezone shift. */
export function formatDateOnly(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
}
