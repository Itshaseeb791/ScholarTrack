// Pure task rules. Stored values are unchanged from Phase 3; "urgent" priority is added by the Phase 7 migration.
import { daysBetween } from "./time.ts";

export const TASK_STATUSES = [["todo", "To do"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]] as const;
export const TASK_PRIORITIES = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number][0];
export type TaskPriority = (typeof TASK_PRIORITIES)[number][0];
export const TASK_STATUS_VALUES = TASK_STATUSES.map((s) => s[0]) as readonly TaskStatus[];
export const TASK_PRIORITY_VALUES = TASK_PRIORITIES.map((s) => s[0]) as readonly TaskPriority[];
export const taskStatusLabel = (s: unknown) => TASK_STATUSES.find((x) => x[0] === s)?.[1] ?? String(s ?? "");
export const priorityLabel = (p: unknown) => TASK_PRIORITIES.find((x) => x[0] === p)?.[1] ?? String(p ?? "");
export const isOpenTask = (status: string) => status === "todo" || status === "in_progress";
export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export type TaskState = "completed" | "cancelled" | "overdue" | "today" | "upcoming" | "no_date";
/** Date-level: a task due today stays "today" all day, even if its time has passed. Completed is never overdue. */
export function taskState(t: { status: string; due_date: string | null }, today: string): TaskState {
  if (t.status === "completed") return "completed";
  if (t.status === "cancelled") return "cancelled";
  if (!t.due_date) return "no_date";
  const d = daysBetween(today, t.due_date);
  return d < 0 ? "overdue" : d === 0 ? "today" : "upcoming";
}

export const TASK_VIEWS = ["all", "today", "upcoming", "overdue", "completed"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];
export const parseTaskView = (v: unknown): TaskView => (TASK_VIEWS as readonly string[]).includes(String(v)) ? (v as TaskView) : "all";

/** The status a toggle moves to. Reopening always returns to "todo". */
export const toggledStatus = (status: string): TaskStatus => (status === "completed" ? "todo" : "completed");

export type TaskTransition = { ok: true } | { ok: false; reason: string };
export function canChangeTaskStatus(from: string, to: string): TaskTransition {
  if (!TASK_STATUS_VALUES.includes(to as TaskStatus)) return { ok: false, reason: "Choose a valid status." };
  if (from === to) return { ok: false, reason: `Already ${taskStatusLabel(to).toLowerCase()}.` };
  return { ok: true }; // any other move is allowed: tasks are personal and mistakes are common
}

export function taskCounts(tasks: { status: string; due_date: string | null }[], today: string) {
  const c = { open: 0, overdue: 0, today: 0, completed: 0 };
  for (const t of tasks) {
    const st = taskState(t, today);
    if (st === "completed") c.completed++;
    else if (isOpenTask(t.status)) { c.open++; if (st === "overdue") c.overdue++; if (st === "today") c.today++; }
  }
  return c;
}
