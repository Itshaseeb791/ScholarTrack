// The single place that turns stored records into dated items. The dashboard, calendar and Deadline Center all
// use it, so a date is never copied anywhere and can never disagree between screens.
import { DUE_SOON_DAYS, isPending } from "./applications.ts";
import { dateInZone, daysBetween, DEFAULT_TIMEZONE, timeInZone } from "./time.ts";

export type Kind = "program" | "application" | "scholarship" | "requirement" | "task" | "event";
export const KIND_LABEL: Record<Kind, string> = {
  program: "Program deadline", application: "Application deadline", scholarship: "Scholarship deadline",
  requirement: "Requirement", task: "Task", event: "Event",
};
/** Order used when several items share a day. */
export const KIND_ORDER: Kind[] = ["application", "requirement", "scholarship", "program", "task", "event"];

// Flat rows (the query layer flattens embeds), so this module stays pure and easy to test.
export type Row = Record<string, string | number | boolean | null | undefined>;
export type DeadlineSources = {
  programs?: Row[]; scholarships?: Row[]; applications?: Row[]; requirements?: Row[]; tasks?: Row[]; events?: Row[];
  /** Programs that already have an application (any status): tracked through it, not listed a second time. */
  coveredPrograms?: string[];
};
export type DeadlineItem = {
  id: string; kind: Kind; title: string; subtitle: string | null;
  date: string | null; endDate: string | null; time: string | null; endTime: string | null; allDay: boolean;
  href: string; done: boolean; priority: string | null; country: string | null; applicationId: string | null; status: string | null;
};

const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const join = (...p: unknown[]) => p.map(s).filter(Boolean).join(" · ") || null;
const hhmm = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 5) : null);
const base = (): Omit<DeadlineItem, "id" | "kind" | "title" | "href"> =>
  ({ subtitle: null, date: null, endDate: null, time: null, endTime: null, allDay: true, done: false, priority: null, country: null, applicationId: null, status: null });

export function buildDeadlineItems(
  src: DeadlineSources, opts: { timeZone?: string; includeDone?: boolean; includeUndated?: boolean } = {},
): DeadlineItem[] {
  const tz = opts.timeZone ?? DEFAULT_TIMEZONE;
  const out: DeadlineItem[] = [];
  const apps = src.applications ?? [];
  const pendingIds = new Set(apps.filter((a) => isPending(String(a.status ?? ""))).map((a) => String(a.id)));
  const covered = new Set(src.coveredPrograms ?? apps.map((a) => String(a.program_id ?? "")));
  const keep = (date: string | null) => opts.includeUndated || date !== null;

  for (const a of apps) {
    if (!pendingIds.has(String(a.id))) continue; // submitted, decided and withdrawn applications are not pending work
    const date = s(a.effective_deadline);
    if (keep(date)) out.push({ ...base(), id: "a" + a.id, kind: "application", title: join(a.university_name, a.program_name) ?? "Application", date, href: `/applications/${a.id}`, country: s(a.university_country), status: s(a.status), applicationId: String(a.id) });
  }
  for (const r of src.requirements ?? []) {
    const date = s(r.due_date);
    const parentPending = r.app_status ? isPending(String(r.app_status)) : pendingIds.has(String(r.application_id));
    if (!date || !parentPending) continue;
    const done = r.is_complete === true;
    if (done && !opts.includeDone) continue;
    out.push({ ...base(), id: "r" + r.id, kind: "requirement", title: String(r.title), subtitle: s(r.app_label), date, href: `/applications/${r.application_id}`, done, applicationId: String(r.application_id) });
  }
  for (const r of src.scholarships ?? []) {
    const date = s(r.application_deadline);
    if (keep(date)) out.push({ ...base(), id: "s" + r.id, kind: "scholarship", title: String(r.name), subtitle: s(r.provider), date, href: `/scholarships/${r.id}`, country: s(r.country) });
  }
  for (const r of src.programs ?? []) {
    const date = s(r.application_deadline);
    if (!date || covered.has(String(r.id))) continue;
    out.push({ ...base(), id: "p" + r.id, kind: "program", title: String(r.name), subtitle: join(r.university_name, r.university_country), date, href: `/programs/${r.id}`, country: s(r.university_country) });
  }
  for (const r of src.tasks ?? []) {
    const st = String(r.status ?? "todo");
    if (st === "cancelled") continue;
    const done = st === "completed";
    if (done && !opts.includeDone) continue;
    const date = s(r.due_date);
    if (!keep(date)) continue;
    const time = hhmm(r.due_time);
    out.push({ ...base(), id: "t" + r.id, kind: "task", title: String(r.title), subtitle: s(r.app_label), date, time, allDay: time === null, href: `/tasks/${r.id}`, done, priority: s(r.priority), status: st, applicationId: s(r.application_id) });
  }
  for (const r of src.events ?? []) {
    const href = `/calendar/events/${r.id}`;
    if (r.all_day === true) {
      const date = s(r.start_date);
      if (date) out.push({ ...base(), id: "e" + r.id, kind: "event", title: String(r.title), subtitle: s(r.location), date, endDate: s(r.end_date), href, applicationId: s(r.application_id), status: s(r.event_type) });
    } else if (s(r.starts_at)) {
      const end = s(r.ends_at);
      out.push({ ...base(), id: "e" + r.id, kind: "event", title: String(r.title), subtitle: s(r.location), date: dateInZone(String(r.starts_at), tz), time: timeInZone(String(r.starts_at), tz),
        endDate: end ? dateInZone(end, tz) : null, endTime: end ? timeInZone(end, tz) : null, allDay: false, href, applicationId: s(r.application_id), status: s(r.event_type) });
    }
  }
  return out;
}

export type Group = "overdue" | "today" | "next7" | "next30" | "later" | "none";
export const GROUPS: { key: Group; label: string }[] = [
  { key: "overdue", label: "Overdue" }, { key: "today", label: "Due today" }, { key: "next7", label: "Next 7 days" },
  { key: "next30", label: "Next 30 days" }, { key: "later", label: "Later" }, { key: "none", label: "No deadline" },
];
export const PASSED_RESEARCH_DAYS = 30;
/** Mutually exclusive: every dated item lands in exactly one group; an unknown date is never overdue. */
export function classify(date: string | null, today: string): Group {
  if (!date) return "none";
  const d = daysBetween(today, date);
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= 7 ? "next7" : d <= 30 ? "next30" : "later";
}
export type Urgency = "overdue" | "due_soon" | "upcoming" | "none";
export const urgencyOf = (date: string | null, today: string): Urgency => {
  if (!date) return "none";
  const d = daysBetween(today, date);
  return d < 0 ? "overdue" : d <= DUE_SOON_DAYS ? "due_soon" : "upcoming";
};
/** Passed program/scholarship dates are research dates, not obligations: kept for 30 days, then dropped. */
export const isStalePassed = (i: DeadlineItem, today: string) =>
  (i.kind === "program" || i.kind === "scholarship") && i.date !== null && daysBetween(i.date, today) > PASSED_RESEARCH_DAYS;

export function groupDeadlines(items: DeadlineItem[], today: string, order: "soonest" | "overdue-first" = "soonest") {
  const groups: Record<Group, DeadlineItem[]> = { overdue: [], today: [], next7: [], next30: [], later: [], none: [] };
  for (const i of items) { if (!isStalePassed(i, today)) groups[classify(i.date, today)].push(i); }
  const cmp = (a: DeadlineItem, b: DeadlineItem) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title);
  for (const k of Object.keys(groups) as Group[]) groups[k].sort(k === "overdue" && order === "overdue-first" ? (a, b) => cmp(a, b) : cmp);
  return groups;
}
export const countGroups = (g: Record<Group, DeadlineItem[]>) => Object.values(g).reduce((n, l) => n + l.length, 0);
