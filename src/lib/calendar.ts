// Pure calendar range math and grouping. Weeks start on Monday. Everything is a date-only string (YYYY-MM-DD).
import { KIND_ORDER, type DeadlineItem } from "./deadlines.ts";
import { addDays, addMonths, isDateOnly, startOfWeek } from "./time.ts";

export const VIEWS = ["month", "week", "day", "agenda"] as const;
export type View = (typeof VIEWS)[number];
export const AGENDA_DAYS = 30;

export const parseView = (v: unknown): View => (VIEWS as readonly string[]).includes(String(v)) ? (v as View) : "month";
export const parseDay = (v: unknown, fallback: string) => (isDateOnly(v) && v >= "1900-01-01" && v <= "2200-12-31" ? v : fallback);

/** 6 weeks x 7 days covering the month of `anchor`, so the grid height never jumps between months. */
export function monthGrid(anchor: string) {
  const first = anchor.slice(0, 8) + "01";
  const start = startOfWeek(first);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return { weeks, from: weeks[0][0], to: weeks[5][6], month: anchor.slice(0, 7) };
}

/** Inclusive date range that a view displays. */
export function rangeFor(view: View, date: string): { from: string; to: string } {
  if (view === "month") { const g = monthGrid(date); return { from: g.from, to: g.to }; }
  if (view === "week") { const f = startOfWeek(date); return { from: f, to: addDays(f, 6) }; }
  if (view === "day") return { from: date, to: date };
  return { from: date, to: addDays(date, AGENDA_DAYS - 1) };
}
export function shiftPeriod(view: View, date: string, dir: -1 | 1): string {
  return view === "month" ? addMonths(date, dir) : view === "week" ? addDays(date, 7 * dir) : view === "day" ? addDays(date, dir) : addDays(date, AGENDA_DAYS * dir);
}

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
export function periodLabel(view: View, date: string): string {
  if (view === "month") return fmt(date, { month: "long", year: "numeric" });
  if (view === "day") return fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { from, to } = rangeFor(view, date);
  return `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Does an item (single day or multi-day) occur on `day`? */
export const occursOn = (i: DeadlineItem, day: string) => i.date !== null && i.date <= day && day <= (i.endDate ?? i.date);

const weight = (i: DeadlineItem) => (i.allDay ? 0 : 1);
export function sortDay(items: DeadlineItem[]): DeadlineItem[] {
  return [...items].sort((a, b) => weight(a) - weight(b) || (a.time ?? "").localeCompare(b.time ?? "")
    || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title));
}
/** Day -> items for every day in [from, to]; multi-day items appear on each day they cover. */
export function groupByDay(items: DeadlineItem[], from: string, to: string): Map<string, DeadlineItem[]> {
  const map = new Map<string, DeadlineItem[]>();
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, []);
  for (const i of items) {
    if (!i.date) continue;
    const last = i.endDate && i.endDate > i.date ? i.endDate : i.date;
    for (let d = i.date < from ? from : i.date; d <= last && d <= to; d = addDays(d, 1)) map.get(d)?.push(i);
  }
  for (const [d, list] of map) map.set(d, sortDay(list));
  return map;
}
