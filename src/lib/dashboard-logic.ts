// Pure dashboard calculations. Dates are YYYY-MM-DD calendar days; "today" comes from the caller (see time.ts).
import { daysBetween, DEFAULT_TIMEZONE } from "./time";
import { countByGroup, GROUPS } from "./applications";
import { buildDeadlineItems, type Kind } from "./deadlines";
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

const SOURCE: Record<Kind, Deadline["source"]> = { program: "Program", scholarship: "Scholarship", application: "Application", requirement: "Requirement", task: "Task", event: "Event" };

/** Upcoming deadlines for the dashboard. Dates come from the shared deadline model (deadlines.ts) so the dashboard,
 *  calendar and Deadline Center cannot disagree; this only applies the dashboard's "from today on" window. */
export function buildDeadlines(
  src: { programs: Row[]; scholarships: Row[]; tasks: Row[]; events: Row[]; applications?: Row[]; requirements?: Row[]; coveredPrograms?: string[] }, today: string, timeZone = DEFAULT_TIMEZONE,
): Deadline[] {
  const items = buildDeadlineItems(src, { timeZone });
  return items
    // Open tasks stay listed once overdue; every other kind only from today on.
    .filter((i) => i.date !== null && (i.kind === "task" || i.date >= today))
    .map((i): Deadline => ({ id: i.id, title: i.title, date: i.date!, source: SOURCE[i.kind], href: i.href }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
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
    high: open.filter((t) => ["high", "urgent"].includes(t.priority ?? "")),
  };
}
