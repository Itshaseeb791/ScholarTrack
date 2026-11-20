// Pure reminder rules. Offset reminders are stored as "N days before" and resolved against the source's CURRENT date,
// so they follow a deadline that moves. Custom reminders store an absolute instant.
// Semantics: a reminder is "delivered in-app" when it is due and shown (Reminder Center, dashboard, header badge).
// It is "acknowledged" only when the user says so. "delivered_at" is reserved for push and is never set in-app.
import { isPending } from "./applications.ts";
import { addDays, dateInZone, DEFAULT_TIMEZONE, todayIn } from "./time.ts";

export const OFFSETS = [[0, "At the deadline"], [1, "1 day before"], [3, "3 days before"], [7, "7 days before"]] as const;
export const OFFSET_VALUES = OFFSETS.map((o) => o[0]) as readonly number[];
export const offsetLabel = (n: number | null) => (n === null ? "Custom time" : OFFSETS.find((o) => o[0] === n)?.[1] ?? `${n} days before`);

export const SOURCE_TYPES = ["task", "event", "application", "scholarship", "program", "requirement"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_COLUMN: Record<SourceType, string> = {
  task: "task_id", event: "event_id", application: "application_id", scholarship: "scholarship_id", program: "program_id", requirement: "requirement_id",
};
/** Offered as one-click suggestions, never created silently. */
export const SUGGESTED_OFFSETS: Record<SourceType, number[]> = { application: [3], scholarship: [7], program: [7], task: [1], event: [1], requirement: [1] };

export type ReminderView = {
  id: string; offset_days: number | null; remind_at: string | null; enabled: boolean;
  acknowledged_at: string | null; dismissed_at: string | null;
  sourceType: SourceType | null; sourceTitle: string | null; sourceDate: string | null; sourceClosed: boolean; sourceEnd: string | null; href: string | null;
};
export type ReminderState = "due" | "scheduled" | "acknowledged" | "dismissed" | "disabled" | "closed" | "no_date" | "orphan";

/** The calendar day (app timezone) on which the reminder fires, or null if it cannot be resolved. */
export function triggerDay(r: Pick<ReminderView, "offset_days" | "remind_at" | "sourceDate">, timeZone = DEFAULT_TIMEZONE): string | null {
  if (r.offset_days !== null) return r.sourceDate ? addDays(r.sourceDate, -r.offset_days) : null;
  return r.remind_at ? dateInZone(r.remind_at, timeZone) : null;
}

export function reminderState(r: ReminderView, now: Date, timeZone = DEFAULT_TIMEZONE): ReminderState {
  if (r.dismissed_at) return "dismissed";
  if (r.acknowledged_at) return "acknowledged";
  if (!r.enabled) return "disabled";
  if (!r.sourceType) return "orphan";
  if (r.sourceClosed) return "closed";
  const today = todayIn(timeZone, now);
  // Research dates (programs, scholarships) stop mattering once passed; open tasks and applications keep reminding.
  if ((r.sourceType === "scholarship" || r.sourceType === "program") && r.sourceDate && r.sourceDate < today) return "closed";
  if (r.sourceType === "event" && r.sourceEnd && new Date(r.sourceEnd) < now) return "closed";
  if (r.offset_days !== null) {
    if (!r.sourceDate) return "no_date";
    return addDays(r.sourceDate, -r.offset_days) <= today ? "due" : "scheduled";
  }
  return r.remind_at && new Date(r.remind_at) <= now ? "due" : "scheduled";
}

/** Offsets still missing for a source, so one-click suggestions never create duplicates. */
export const missingOffsets = (existing: (number | null)[], wanted: number[]) => wanted.filter((w) => !existing.includes(w));

/** Closed-source rule used when flattening a source row for reminders. */
export function sourceClosed(type: SourceType, row: { status?: string | null; is_complete?: boolean | null; app_status?: string | null }): boolean {
  if (type === "task") return row.status === "completed" || row.status === "cancelled";
  if (type === "requirement") return row.is_complete === true || (row.app_status ? !isPending(row.app_status) : false);
  if (type === "application") return row.status ? !isPending(row.status) : false;
  return false;
}
