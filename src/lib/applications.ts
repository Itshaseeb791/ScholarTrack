// Pure application-tracking rules shared by Server Actions, pages, the dashboard and the unit tests.
import { daysBetween } from "./time.ts";

// Stored values are unchanged from Phase 3 ("ready_to_apply" is only *displayed* as "Ready to Submit");
// "waitlisted" was added in the Phase 6 migration.
export const STATUSES = [
  ["researching", "Researching"], ["preparing", "Preparing"], ["ready_to_apply", "Ready to Submit"],
  ["submitted", "Submitted"], ["under_review", "Under Review"], ["interview", "Interview"],
  ["accepted", "Accepted"], ["rejected", "Rejected"], ["waitlisted", "Waitlisted"], ["withdrawn", "Withdrawn"],
] as const;
export type Status = (typeof STATUSES)[number][0];
export const STATUS_VALUES = STATUSES.map((s) => s[0]) as readonly Status[];
export const statusLabel = (s: unknown) => STATUSES.find((x) => x[0] === s)?.[1] ?? String(s ?? "");

// Every status is in exactly one group, so no application is counted twice within a metric.
export const GROUPS = {
  in_progress: ["researching", "preparing", "ready_to_apply"],
  submitted: ["submitted", "under_review", "interview"],
  decisions: ["accepted", "rejected", "waitlisted"],
  withdrawn: ["withdrawn"],
} as const satisfies Record<string, readonly Status[]>;
export type Group = keyof typeof GROUPS;
export const statusGroup = (s: string): Group | null =>
  (Object.keys(GROUPS) as Group[]).find((g) => (GROUPS[g] as readonly string[]).includes(s)) ?? null;
export const isPending = (s: string) => statusGroup(s) === "in_progress";

export function countByGroup(statuses: string[]) {
  const out = { total: statuses.length, in_progress: 0, submitted: 0, decisions: 0, withdrawn: 0 };
  for (const s of statuses) { const g = statusGroup(s); if (g) out[g]++; }
  return out;
}

export type Transition = { ok: true } | { ok: false; reason: string };
/** Forward moves and corrections within a stage are allowed; un-submitting is not (use Withdrawn). */
export function canTransition(from: string, to: string): Transition {
  if (!STATUS_VALUES.includes(to as Status)) return { ok: false, reason: "Choose a valid status." };
  if (from === to) return { ok: false, reason: `Already ${statusLabel(to)}.` };
  const fg = statusGroup(from), tg = statusGroup(to);
  if (fg === "withdrawn" && tg !== "in_progress") return { ok: false, reason: "A withdrawn application can only be reopened as Researching or Preparing." };
  if ((fg === "submitted" || fg === "decisions") && tg === "in_progress")
    return { ok: false, reason: "This application was already submitted. Set Withdrawn if you are stopping it." };
  return { ok: true };
}

export const SCHOLARSHIP_OUTCOMES = [
  ["not_applied", "Not applied"], ["preparing", "Preparing"], ["applied", "Applied"],
  ["awarded", "Awarded"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"],
] as const;
export const outcomeLabel = (o: unknown) => SCHOLARSHIP_OUTCOMES.find((x) => x[0] === o)?.[1] ?? String(o ?? "");

/** Suggestions only: nothing here is asserted to be required by any university. */
export const STARTER_REQUIREMENTS = [
  "Statement of purpose", "CV / resume", "Academic transcripts", "Degree certificate", "English language test",
  "Recommendation letters", "Passport copy", "Portfolio", "Research proposal", "Application fee payment",
] as const;

export type DeadlineSource = "application" | "program" | null;
/** Precedence: application-specific deadline, then the program's, otherwise unknown. */
export function effectiveDeadline(application: string | null | undefined, program: string | null | undefined): { date: string | null; source: DeadlineSource } {
  if (application) return { date: application, source: "application" };
  if (program) return { date: program, source: "program" };
  return { date: null, source: null };
}

export type DeadlineState = "none" | "closed" | "overdue" | "due_soon" | "upcoming";
export const DUE_SOON_DAYS = 3; // same threshold as the dashboard's "urgent"
/** Closed (submitted, decided, withdrawn) is never overdue; an unknown deadline is never overdue. */
export function deadlineState(status: string, date: string | null, today: string): DeadlineState {
  if (!isPending(status)) return "closed";
  if (!date) return "none";
  const d = daysBetween(today, date);
  return d < 0 ? "overdue" : d <= DUE_SOON_DAYS ? "due_soon" : "upcoming";
}

export function requirementsProgress(reqs: { is_complete: boolean }[]) {
  const total = reqs.length, done = reqs.filter((r) => r.is_complete).length;
  return { total, done, remaining: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
export const progressOf = (total: number, done: number) => requirementsProgress(Array.from({ length: total }, (_, i) => ({ is_complete: i < done })));

/** Same program is a soft warning; same intake is flagged more strongly. Different cycles stay legitimate. */
export function duplicateKind(existing: { id: string; intake: string | null }[], intake: string | null, excludeId: string | null): "same-intake" | "other-intake" | null {
  const others = existing.filter((e) => e.id !== excludeId);
  if (others.length === 0) return null;
  const norm = (v: string | null) => (v ?? "").trim().toLowerCase();
  return others.some((e) => norm(e.intake) === norm(intake)) ? "same-intake" : "other-intake";
}
