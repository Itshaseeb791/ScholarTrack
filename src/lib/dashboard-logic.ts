// Pure dashboard calculations. Dates are YYYY-MM-DD calendar days; "today" comes from the caller (see time.ts).
import { dateInZone, daysBetween, DEFAULT_TIMEZONE } from "./time";
import { countByGroup, GROUPS, isPending } from "./applications";
export type Row = Record<string, string | null>;
export type Deadline = { id: string; title: string; date: string; source: "Program" | "Scholarship" | "Application" | "Requirement" | "Task" | "Event"; href: string };

// Definitions live in applications.ts (each status is in exactly one group).
export const IN_PROGRESS: readonly string[] = GROUPS.in_progress;
export const SUBMITTED: readonly string[] = GROUPS.submitted;
export const DECISIONS: readonly string[] = GROUPS.decisions;
export const UPCOMING_DAYS = 30;

export const daysUntil = (date: string, today: string) => daysBetween(today, date);
export const remaining = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days left`);
export const urgency = (d: number) => (d < 0 ? "overdue" : d <= 3 ? "urgent" : "normal") as "overdue" | "urgent" | "normal";
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function buildDeadlines(
  src: { programs: Row[]; scholarships: Row[]; tasks: Row[]; events: Row[]; applications?: Row[]; requirements?: Row[]; coveredPrograms?: string[] }, today: string, timeZone = DEFAULT_TIMEZONE,
): Deadline[] {
  const out: Deadline[] = [];
  // A program that has an application is tracked through that application (its own deadline override, status and
  // checklist), so its general program deadline is not listed a second time.
  const covered = new Set(src.coveredPrograms ?? []);
  // Only applications still being prepared have an actionable deadline; submitted/decided/withdrawn ones are closed.
  const pendingApps = new Set<string>();
  for (const r of src.applications ?? []) if (isPending(r.status ?? "")) {
    pendingApps.add(r.id!);
    if (r.effective_deadline && r.effective_deadline >= today)
      out.push({ id: "a" + r.id, title: `${r.university_name} · ${r.program_name}`, date: r.effective_deadline, source: "Application", href: "/applications/" + r.id });
  }
  for (const r of src.requirements ?? []) if (r.due_date && r.due_date >= today && pendingApps.has(r.application_id ?? ""))
    out.push({ id: "r" + r.id, title: r.title!, date: r.due_date, source: "Requirement", href: "/applications/" + r.application_id });
  for (const r of src.programs) if (r.application_deadline && r.application_deadline >= today && !covered.has(r.id!))
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
  const g = countByGroup(applicationStatuses);
  return {
    universities, scholarships,
    applications: g.total, inProgress: g.in_progress, submitted: g.submitted, decisions: g.decisions,
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
