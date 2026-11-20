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

// ---- Phase 7 helpers (calendar, events, reminders) --------------------------------------------------
/** True for a real calendar day in YYYY-MM-DD form. */
export function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export const isTimeOnly = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** UTC offset of `timeZone` at the given instant, in milliseconds (east of UTC is positive). */
function offsetMs(utcMs: number, timeZone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
    .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
/** The instant at which the wall clock in `timeZone` reads `date` `time`. Computed on the server only. */
export function zonedInstant(date: string, time: string, timeZone = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess, timeZone);
  t = guess - offsetMs(t, timeZone); // second pass settles zones whose offset changes near the guess (DST)
  return new Date(t);
}
/** Wall-clock "HH:MM" of an instant in `timeZone`. */
export function timeInZone(instant: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}

/** Weekday of a date-only value, 0 = Monday ... 6 = Sunday. */
export const weekdayMon0 = (date: string) => (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
export const startOfWeek = (date: string) => addDays(date, -weekdayMon0(date));
export const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();
/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n, ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, daysInMonth(ny, nm))).padStart(2, "0")}`;
}
