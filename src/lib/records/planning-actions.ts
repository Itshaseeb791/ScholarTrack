"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { SOURCE_COLUMN, SUGGESTED_OFFSETS, missingOffsets, type SourceType } from "@/lib/reminders";
import { canChangeTaskStatus, toggledStatus } from "@/lib/tasks";
import { getTimezone } from "@/lib/time";
import { hasPhase7 } from "./planning-queries";
import { isUuid, parseEvent, parseReminder, parseTask, type Errors, type Input } from "./validate";

// Every action starts with requireOwner() and validates on the server. user_id is never read from the client
// (column default auth.uid() + RLS), and every foreign key is a composite (id, user_id) key owned by the same user.
export type PlanState = { ok?: boolean; error?: string; errors?: Errors; values?: Input };

const toInput = (fd: FormData): Input => {
  const o: Input = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
};
const refresh = () => revalidatePath("/", "layout");
const SETUP = "Planning features need the Phase 7 database migration (20261115000100_phase7_planning.sql).";
const dbMessage = (e: { code?: string }) =>
  e.code === "23503" ? "A referenced record does not exist or is still in use."
    : e.code === "23505" ? "That already exists."
      : e.code === "23514" ? "A value was rejected by a database rule."
        : e.code === "42501" ? "You do not have permission to do that."
          : "Could not save. Check your connection and try again.";

async function applicationExists(db: Awaited<ReturnType<typeof requireOwner>>["supabase"], id: string | null) {
  if (!id) return true;
  const { data } = await db.from("applications").select("id").eq("id", id).maybeSingle();
  return !!data;
}

// ---- tasks ----------------------------------------------------------------------------------------------------
export async function saveTask(id: string | null, _prev: PlanState, fd: FormData): Promise<PlanState> {
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return { error: SETUP };
  if (id !== null && !isUuid(id)) return { error: "Invalid task." };
  const input = toInput(fd);
  const parsed = parseTask(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  if (!(await applicationExists(supabase, parsed.values.application_id))) return { errors: { application_id: "That application no longer exists." }, values: input };
  const q = id ? supabase.from("tasks").update(parsed.values).eq("id", id) : supabase.from("tasks").insert(parsed.values);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { error: dbMessage(error), values: input };
  if (!data) return { error: "That task no longer exists.", values: input };
  refresh();
  redirect(`/tasks/${data.id}`);
}

export async function setTaskStatus(id: string, status: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid task." };
  const { data: cur } = await supabase.from("tasks").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "That task no longer exists." };
  const t = canChangeTaskStatus(cur.status, status);
  if (!t.ok) return { error: t.reason };
  // completed_at is stamped (or cleared) by a database trigger, so it can never disagree with the status.
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) return { error: dbMessage(error) };
  refresh();
  return {};
}

export async function toggleTask(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid task." };
  const { data: cur } = await supabase.from("tasks").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "That task no longer exists." };
  return setTaskStatus(id, toggledStatus(cur.status));
}

export async function deleteTask(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid task." };
  const { error } = await supabase.from("tasks").delete().eq("id", id); // reminders go with it; the application is untouched
  if (error) return { error: dbMessage(error) };
  refresh();
  redirect("/tasks");
}

// ---- events ---------------------------------------------------------------------------------------------------
export async function saveEvent(id: string | null, _prev: PlanState, fd: FormData): Promise<PlanState> {
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return { error: SETUP };
  if (id !== null && !isUuid(id)) return { error: "Invalid event." };
  const input = toInput(fd);
  const parsed = parseEvent(input, getTimezone());
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  if (!(await applicationExists(supabase, parsed.values.application_id))) return { errors: { application_id: "That application no longer exists." }, values: input };
  const q = id ? supabase.from("events").update(parsed.values).eq("id", id) : supabase.from("events").insert(parsed.values);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { error: dbMessage(error), values: input };
  if (!data) return { error: "That event no longer exists.", values: input };
  refresh();
  redirect(`/calendar/events/${data.id}`);
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid event." };
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { error: dbMessage(error) };
  refresh();
  redirect("/calendar");
}

// ---- reminders ------------------------------------------------------------------------------------------------
const SOURCE_TABLE: Record<SourceType, string> = { task: "tasks", event: "events", application: "applications", scholarship: "scholarships", program: "programs", requirement: "application_requirements" };

/** Creates the missing reminders in ONE insert (atomic). The source must exist and belong to the owner (RLS). */
async function insertReminders(db: Awaited<ReturnType<typeof requireOwner>>["supabase"], type: SourceType, sourceId: string, offsets: number[], remindAt: string | null): Promise<PlanState> {
  const { data: src } = await db.from(SOURCE_TABLE[type]).select("id").eq("id", sourceId).maybeSingle();
  if (!src) return { error: "That item no longer exists." };
  const col = SOURCE_COLUMN[type];
  let rows: Record<string, unknown>[];
  if (remindAt) {
    rows = [{ [col]: sourceId, remind_at: remindAt }];
  } else {
    const { data: have } = await db.from("reminders").select("offset_days").eq(col, sourceId).not("offset_days", "is", null);
    const todo = missingOffsets((have ?? []).map((h) => h.offset_days as number), offsets);
    if (todo.length === 0) return { ok: true }; // idempotent: everything asked for already exists
    rows = todo.map((n) => ({ [col]: sourceId, offset_days: n }));
  }
  const { error } = await db.from("reminders").insert(rows);
  if (error && error.code !== "23505") return { error: dbMessage(error) };
  refresh();
  return { ok: true };
}

export async function addReminders(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return { error: SETUP };
  const input = toInput(fd);
  input.offsets = fd.getAll("offset").filter((x): x is string => typeof x === "string").join(",");
  const parsed = parseReminder(input, getTimezone());
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const v = parsed.values;
  return insertReminders(supabase, v.source_type as SourceType, v.source_id, v.offsets, v.remind_at);
}

/** One-click suggested defaults (e.g. 3 days before an application deadline). Never runs automatically. */
export async function addSuggestedReminders(type: SourceType, sourceId: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(sourceId) || !(type in SUGGESTED_OFFSETS)) return { error: "Invalid request." };
  if (!(await hasPhase7(supabase))) return { error: SETUP };
  const r = await insertReminders(supabase, type, sourceId, SUGGESTED_OFFSETS[type], null);
  return r.error ? { error: r.error } : {};
}

async function patchReminder(id: string, patch: Record<string, unknown>): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid reminder." };
  const { data, error } = await supabase.from("reminders").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { error: dbMessage(error) };
  if (!data) return { error: "That reminder no longer exists." };
  refresh();
  return {};
}
export const acknowledgeReminder = async (id: string) => patchReminder(id, { acknowledged_at: new Date().toISOString() });
export const dismissReminder = async (id: string) => patchReminder(id, { dismissed_at: new Date().toISOString() });
/** Brings a dismissed or acknowledged reminder back (it will show again if it is still due). */
export const restoreReminder = async (id: string) => patchReminder(id, { dismissed_at: null, acknowledged_at: null });
export const setReminderEnabled = async (id: string, enabled: boolean) => patchReminder(id, { enabled: enabled === true });

export async function deleteReminder(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid reminder." };
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { error: dbMessage(error) };
  refresh();
  return {};
}

/** Form-action wrapper for the status select on the task page. */
export async function changeTaskStatus(id: string, fd: FormData): Promise<void> {
  const r = await setTaskStatus(id, String(fd.get("status") ?? ""));
  if (r.error) throw new Error(r.error);
}
