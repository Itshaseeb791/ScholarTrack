// Pure dashboard calculations. Dates are YYYY-MM-DD calendar days; "today" comes from the caller (see time.ts).
import { dateInZone, daysBetween, DEFAULT_TIMEZONE } from "./time";
export type Row = Record<string, string | null>;
export type Deadline = { id: string; title: string; date: string; source: "Program" | "Scholarship" | "Task" | "Event"; href: string };

export const IN_PROGRESS = ["researching", "preparing", "ready_to_apply"];
export const SUBMITTED = ["submitted", "under_review", "interview", "accepted", "rejected"];
export const UPCOMING_DAYS = 30;

export const daysUntil = (date: string, today: string) => daysBetween(today, date);
export const remaining = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days left`);
export const urgency = (d: number) => (d < 0 ? "overdue" : d <= 3 ? "urgent" : "normal") as "overdue" | "urgent" | "normal";
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function buildDeadlines(
  src: { programs: Row[]; scholarships: Row[]; tasks: Row[]; events: Row[] }, today: string, timeZone = DEFAULT_TIMEZONE,
): Deadline[] {
  const out: Deadline[] = [];
  for (const r of src.programs) if (r.application_deadline && r.application_deadline >= today)
    out.push({ id: "p" + r.id, title: r.name!, date: r.application_deadline, source: "Program", href: "/programs/" + r.id });
  for (const r of src.scholarships) if (r.application_deadline && r.application_deadline >= today)
    out.push({ id: "s" + r.id, title: r.name!, date: r.application_deadline, source: "Scholarship", href: "/scholarships/" + r.id });
  // Open tasks stay listed once overdue; finished work is not a deadline.
  for (const r of src.tasks) if (r.due_date && ["todo", "in_progress"].includes(r.status ?? ""))
    out.push({ id: "t" + r.id, title: r.title!, date: r.due_date, source: "Task", href: "/tasks" });
  for (const r of src.events) {
    const day = r.starts_at ? dateInZone(r.starts_at, timeZone) : null; // timestamp -> local calendar day
    if (day && day >= today) out.push({ id: "e" + r.id, title: r.title!, date: day, source: "Event", href: "/calendar" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function buildStats(applicationStatuses: string[], universities: number, scholarships: number, deadlines: Deadline[], today: string) {
  return {
    universities, scholarships,
    applications: applicationStatuses.length,
    inProgress: applicationStatuses.filter((s) => IN_PROGRESS.includes(s)).length,
    submitted: applicationStatuses.filter((s) => SUBMITTED.includes(s)).length,
    upcoming: deadlines.filter((d) => { const n = daysUntil(d.date, today); return n >= 0 && n <= UPCOMING_DAYS; }).length,
  };
}

export function groupTasks(tasks: Row[], today: string) {
  const open = tasks.filter((t) => ["todo", "in_progress"].includes(t.status ?? ""));
  return {
    overdue: open.filter((t) => t.due_date && t.due_date < today),
    today: open.filter((t) => t.due_date === today),
    high: open.filter((t) => t.priority === "high"),
  };
}
