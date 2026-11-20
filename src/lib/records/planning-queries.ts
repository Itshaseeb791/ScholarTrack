import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GROUPS as APP_GROUPS } from "../applications";
import { buildDeadlineItems, type DeadlineItem, type Row } from "../deadlines";
import { PAGE_SIZE, type ListParams } from "./params";
import { addDays, dateInZone, DEFAULT_TIMEZONE, zonedInstant } from "../time";
import { sourceClosed, type ReminderView, type SourceType } from "../reminders";
import { isUuid } from "./validate";

type DB = SupabaseClient;
const PENDING = [...APP_GROUPS.in_progress];
const LIMIT = 500;
export const TASK_SORTS = ["due", "recent", "updated"] as const;
export const TASK_FILTERS = ["priority", "status", "application"] as const;

function fail(error: { code?: string } | null): asserts error is null {
  if (error) throw new Error("Query failed: " + (error.code ?? "unknown"));
}
/** True once the Phase 7 migration is applied (probes a column it adds). One cheap probe per request. */
export const hasPhase7 = cache(async (db: DB) => !(await db.from("reminders").select("offset_days").limit(0)).error);

type Embedded = Record<string, unknown>;
const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] as T) ?? null : (v as T) ?? null);
const appLabel = (a: Embedded | null) => {
  const p = one<Embedded>(a?.programs); const u = one<Embedded>(p?.universities);
  return a ? [u?.name, p?.name].filter(Boolean).join(" · ") || null : null;
};

// ---- flatteners: embedded PostgREST rows -> the flat rows deadlines.ts expects --------------------------------
const flatProgram = (r: Embedded): Row => { const u = one<Embedded>(r.universities); return { id: r.id as string, name: r.name as string, application_deadline: r.application_deadline as string | null, university_name: (u?.name as string) ?? null, university_country: (u?.country as string) ?? null }; };
const flatTask = (r: Embedded): Row => ({ id: r.id as string, title: r.title as string, due_date: r.due_date as string | null, due_time: r.due_time as string | null, status: r.status as string, priority: r.priority as string, application_id: r.application_id as string | null, app_label: appLabel(one<Embedded>(r.applications)) });
const flatRequirement = (r: Embedded): Row => { const a = one<Embedded>(r.applications); return { id: r.id as string, title: r.title as string, due_date: r.due_date as string | null, is_complete: r.is_complete as boolean, application_id: r.application_id as string, app_status: (a?.status as string) ?? null, app_label: appLabel(a) }; };

const TASK_SELECT = "id,title,due_date,due_time,status,priority,application_id,applications(programs(name,universities(name)))";
const REQ_SELECT = "id,title,due_date,is_complete,application_id,applications!inner(status,programs(name,universities(name)))";
const PROGRAM_SELECT = "id,name,application_deadline,universities(name,country)";
const EVENT_SELECT = "id,title,event_type,all_day,start_date,end_date,starts_at,ends_at,location,application_id";

async function coveredPrograms(db: DB) {
  const { data, error } = await db.from("applications").select("program_id").limit(1000);
  fail(error);
  return (data ?? []).map((a) => a.program_id as string);
}

async function eventsBetween(db: DB, from: string, to: string, tz: string): Promise<Row[]> {
  const a = zonedInstant(from, "00:00", tz).toISOString(), b = zonedInstant(addDays(to, 1), "00:00", tz).toISOString();
  const [timed, allDay] = await Promise.all([
    // overlaps [a, b): starts before the end of the range and (ends, or starts, after its start)
    db.from("events").select(EVENT_SELECT).eq("all_day", false).lt("starts_at", b).or(`ends_at.gte.${a},and(ends_at.is.null,starts_at.gte.${a})`).order("starts_at").limit(LIMIT),
    db.from("events").select(EVENT_SELECT).eq("all_day", true).lte("start_date", to).or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`).order("start_date").limit(LIMIT),
  ]);
  fail(timed.error); fail(allDay.error);
  return [...(timed.data ?? []), ...(allDay.data ?? [])] as Row[];
}

/** Calendar: only records whose date falls inside [from, to] (inclusive), each source bounded and indexed. */
export async function loadCalendarItems(db: DB, from: string, to: string, tz = DEFAULT_TIMEZONE): Promise<DeadlineItem[]> {
  const [programs, scholarships, apps, reqs, tasks, events, covered] = await Promise.all([
    db.from("programs").select(PROGRAM_SELECT).gte("application_deadline", from).lte("application_deadline", to).limit(LIMIT),
    db.from("scholarships").select("id,name,provider,country,application_deadline").gte("application_deadline", from).lte("application_deadline", to).limit(LIMIT),
    db.from("application_overview").select("id,program_id,status,effective_deadline,university_name,university_country,program_name").in("status", PENDING).gte("effective_deadline", from).lte("effective_deadline", to).limit(LIMIT),
    db.from("application_requirements").select(REQ_SELECT).gte("due_date", from).lte("due_date", to).limit(LIMIT),
    db.from("tasks").select(TASK_SELECT).gte("due_date", from).lte("due_date", to).limit(LIMIT),
    eventsBetween(db, from, to, tz),
    coveredPrograms(db),
  ]);
  for (const r of [programs, scholarships, apps, reqs, tasks]) fail(r.error);
  return buildDeadlineItems({
    programs: (programs.data ?? []).map(flatProgram), scholarships: (scholarships.data ?? []) as Row[], applications: (apps.data ?? []) as Row[],
    requirements: (reqs.data ?? []).map(flatRequirement), tasks: (tasks.data ?? []).map(flatTask), events, coveredPrograms: covered,
  }, { timeZone: tz, includeDone: true });
}

/** Deadline Center: everything still actionable, including overdue and undated items (bounded per source). */
export async function loadCenterItems(db: DB, today: string, tz = DEFAULT_TIMEZONE): Promise<DeadlineItem[]> {
  const recent = addDays(today, -30);
  const [programs, scholarships, apps, reqs, tasks, events, covered] = await Promise.all([
    db.from("programs").select(PROGRAM_SELECT).gte("application_deadline", recent).limit(LIMIT),
    db.from("scholarships").select("id,name,provider,country,application_deadline").gte("application_deadline", recent).limit(LIMIT),
    db.from("application_overview").select("id,program_id,status,effective_deadline,university_name,university_country,program_name").in("status", PENDING).limit(LIMIT),
    db.from("application_requirements").select(REQ_SELECT).eq("is_complete", false).not("due_date", "is", null).limit(LIMIT),
    db.from("tasks").select(TASK_SELECT).in("status", ["todo", "in_progress"]).limit(LIMIT),
    eventsBetween(db, today, addDays(today, 90), tz),
    coveredPrograms(db),
  ]);
  for (const r of [programs, scholarships, apps, reqs, tasks]) fail(r.error);
  return buildDeadlineItems({
    programs: (programs.data ?? []).map(flatProgram), scholarships: (scholarships.data ?? []) as Row[], applications: (apps.data ?? []) as Row[],
    requirements: (reqs.data ?? []).map(flatRequirement), tasks: (tasks.data ?? []).map(flatTask), events, coveredPrograms: covered,
  }, { timeZone: tz, includeUndated: true });
}

// ---- tasks -------------------------------------------------------------------------------------------------------
export type TaskRow = {
  id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null; due_time: string | null;
  application_id: string | null; completed_at: string | null; created_at: string; updated_at: string; app_label: string | null;
};
const taskRow = (r: Embedded): TaskRow => ({ ...(r as unknown as TaskRow), app_label: appLabel(one<Embedded>(r.applications)) });
const TASK_FULL = "id,title,description,status,priority,due_date,due_time,application_id,completed_at,created_at,updated_at,applications(programs(name,universities(name)))";

export async function listTasks(db: DB, p: ListParams, view: string, today: string) {
  let q = db.from("tasks").select(TASK_FULL, { count: "exact" });
  if (p.q) q = q.or(`title.ilike.%${p.q}%,description.ilike.%${p.q}%`);
  const f = p.filters;
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.status) q = q.eq("status", f.status);
  if (f.application && isUuid(f.application)) q = q.eq("application_id", f.application);
  if (view === "today") q = q.in("status", ["todo", "in_progress"]).eq("due_date", today);
  else if (view === "upcoming") q = q.in("status", ["todo", "in_progress"]).gt("due_date", today);
  else if (view === "overdue") q = q.in("status", ["todo", "in_progress"]).lt("due_date", today);
  else if (view === "completed") q = q.eq("status", "completed");
  q = p.sort === "recent" ? q.order("created_at", { ascending: false }) : p.sort === "updated" ? q.order("updated_at", { ascending: false })
    : q.order("due_date", { ascending: true, nullsFirst: false }).order("due_time", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, count, error } = await q.range(p.from, p.to);
  fail(error);
  return { rows: (data ?? []).map((r) => taskRow(r as Embedded)), total: count ?? 0 };
}
export async function taskTabCounts(db: DB, today: string) {
  const open = ["todo", "in_progress"];
  const c = (q: PromiseLike<{ count: number | null; error: { code?: string } | null }>) => Promise.resolve(q).then((r) => { fail(r.error); return r.count ?? 0; });
  const base = () => db.from("tasks").select("id", { count: "exact", head: true });
  const [all, tod, up, over, done] = await Promise.all([
    c(base()), c(base().in("status", open).eq("due_date", today)), c(base().in("status", open).gt("due_date", today)),
    c(base().in("status", open).lt("due_date", today)), c(base().eq("status", "completed")),
  ]);
  return { all, today: tod, upcoming: up, overdue: over, completed: done };
}
export async function getTask(db: DB, id: string) {
  const { data, error } = await db.from("tasks").select(TASK_FULL).eq("id", id).maybeSingle();
  fail(error);
  return data ? taskRow(data as Embedded) : null;
}
export async function applicationOptions(db: DB) {
  const { data, error } = await db.from("application_overview").select("id,university_name,program_name,intake,status").order("updated_at", { ascending: false }).limit(300);
  fail(error);
  return (data ?? []).map((a) => [a.id as string, [a.university_name, a.program_name, a.intake].filter(Boolean).join(" · ")] as const);
}

// ---- reminders ---------------------------------------------------------------------------------------------------
const REMINDER_SELECT = "*, tasks(title,due_date,due_time,status), events(title,all_day,start_date,end_date,starts_at,ends_at), applications(id,status,application_deadline,programs(name,application_deadline,universities(name))), scholarships(name,application_deadline), programs(name,application_deadline), application_requirements(title,due_date,is_complete,application_id,applications(status))";

export type ReminderRecord = ReminderView & { source_id: string | null; created_at: string; offsetLabelKey: number | null };

export function toReminderView(r: Embedded, tz: string): ReminderRecord {
  const task = one<Embedded>(r.tasks), ev = one<Embedded>(r.events), app = one<Embedded>(r.applications), sch = one<Embedded>(r.scholarships),
    prog = one<Embedded>(r.programs), req = one<Embedded>(r.application_requirements);
  let sourceType: SourceType | null = null, title: string | null = null, date: string | null = null, closed = false, href: string | null = null, end: string | null = null, sourceId: string | null = null;
  if (r.task_id && task) { sourceType = "task"; sourceId = r.task_id as string; title = task.title as string; date = task.due_date as string | null; closed = sourceClosed("task", { status: task.status as string }); href = `/tasks/${r.task_id}`; }
  else if (r.event_id && ev) {
    sourceType = "event"; sourceId = r.event_id as string; title = ev.title as string; href = `/calendar/events/${r.event_id}`;
    if (ev.all_day) { date = ev.start_date as string; end = zonedInstant((ev.end_date as string) ?? (ev.start_date as string), "23:59", tz).toISOString(); }
    else { date = dateInZone(ev.starts_at as string, tz); end = (ev.ends_at as string) ?? (ev.starts_at as string); }
  } else if (r.application_id && app) {
    const p = one<Embedded>(app.programs), u = one<Embedded>(p?.universities);
    sourceType = "application"; sourceId = r.application_id as string; title = [u?.name, p?.name].filter(Boolean).join(" · ") || "Application";
    date = (app.application_deadline as string | null) ?? (p?.application_deadline as string | null) ?? null; closed = sourceClosed("application", { status: app.status as string }); href = `/applications/${r.application_id}`;
  } else if (r.scholarship_id && sch) { sourceType = "scholarship"; sourceId = r.scholarship_id as string; title = sch.name as string; date = sch.application_deadline as string | null; href = `/scholarships/${r.scholarship_id}`; }
  else if (r.program_id && prog) { sourceType = "program"; sourceId = r.program_id as string; title = prog.name as string; date = prog.application_deadline as string | null; href = `/programs/${r.program_id}`; }
  else if (r.requirement_id && req) {
    const ra = one<Embedded>(req.applications);
    sourceType = "requirement"; sourceId = r.requirement_id as string; title = req.title as string; date = req.due_date as string | null;
    closed = sourceClosed("requirement", { is_complete: req.is_complete as boolean, app_status: (ra?.status as string) ?? null }); href = `/applications/${req.application_id}`;
  }
  return {
    id: r.id as string, offset_days: (r.offset_days as number | null) ?? null, remind_at: (r.remind_at as string | null) ?? null, enabled: r.enabled === true,
    acknowledged_at: (r.acknowledged_at as string | null) ?? null, dismissed_at: (r.dismissed_at as string | null) ?? null,
    sourceType, sourceTitle: title, sourceDate: date, sourceClosed: closed, sourceEnd: end, href, source_id: sourceId, created_at: r.created_at as string, offsetLabelKey: (r.offset_days as number | null) ?? null,
  };
}

export async function loadReminders(db: DB, tz = DEFAULT_TIMEZONE): Promise<ReminderRecord[]> {
  const { data, error } = await db.from("reminders").select(REMINDER_SELECT).order("created_at", { ascending: false }).limit(300);
  fail(error);
  return (data ?? []).map((r) => toReminderView(r as Embedded, tz));
}
export async function remindersFor(db: DB, type: SourceType, id: string, tz = DEFAULT_TIMEZONE): Promise<ReminderRecord[]> {
  const col = { task: "task_id", event: "event_id", application: "application_id", scholarship: "scholarship_id", program: "program_id", requirement: "requirement_id" }[type];
  const { data, error } = await db.from("reminders").select(REMINDER_SELECT).eq(col, id).order("offset_days", { ascending: false, nullsFirst: false }).limit(50);
  fail(error);
  return (data ?? []).map((r) => toReminderView(r as Embedded, tz));
}

export { PAGE_SIZE };

/** Everything planning-related that belongs to one application: its tasks, events and reminders (incl. its requirements'). */
export async function applicationPlanning(db: DB, applicationId: string, requirementIds: string[], tz = DEFAULT_TIMEZONE) {
  const [tasks, events, own, req] = await Promise.all([
    db.from("tasks").select("id,title,status,priority,due_date,due_time").eq("application_id", applicationId).order("due_date", { nullsFirst: false }).limit(50),
    db.from("events").select("id,title,all_day,start_date,starts_at,event_type").eq("application_id", applicationId).order("starts_at", { nullsFirst: false }).limit(50),
    db.from("reminders").select(REMINDER_SELECT).eq("application_id", applicationId).limit(50),
    requirementIds.length ? db.from("reminders").select(REMINDER_SELECT).in("requirement_id", requirementIds).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [tasks, events, own, req]) fail(r.error);
  return {
    tasks: (tasks.data ?? []) as { id: string; title: string; status: string; priority: string; due_date: string | null; due_time: string | null }[],
    events: (events.data ?? []) as { id: string; title: string; all_day: boolean; start_date: string | null; starts_at: string | null; event_type: string }[],
    reminders: [...(own.data ?? []), ...(req.data ?? [])].map((r) => toReminderView(r as Embedded, tz)),
  };
}
