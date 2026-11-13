"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
import { canTransition, duplicateKind, SCHOLARSHIP_OUTCOMES, STARTER_REQUIREMENTS } from "@/lib/applications";
import { getTimezone, todayIn } from "@/lib/time";
import { hasPhase6 } from "./application-queries";
import { isUuid, parseApplication, parseRequirement, parseStatusChange, type Errors, type Input } from "./validate";

// Every action starts with requireOwner() and validates on the server. user_id is never read from the client:
// the column defaults to auth.uid() and RLS pins it. Multi-row writes go through SQL functions (one transaction).
export type ActionState = { ok?: boolean; error?: string; errors?: Errors; duplicate?: boolean; values?: Input };

const toInput = (fd: FormData): Input => {
  const o: Input = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
};
const refresh = () => revalidatePath("/", "layout");
const SETUP = "Application tracking needs the Phase 6 database migration (20261114000100_phase6_applications.sql).";
const dbMessage = (e: { code?: string }) =>
  e.code === "23503" ? "A referenced record does not exist or is still in use."
    : e.code === "23505" ? "That already exists."
      : e.code === "23514" ? "A value was rejected by a database rule."
        : e.code === "P0002" ? "That application no longer exists."
          : e.code === "22023" ? "The status is already set to that value."
            : e.code === "42501" ? "You do not have permission to do that."
              : "Could not save. Check your connection and try again.";

export async function saveApplication(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  if (!(await hasPhase6(supabase))) return { error: SETUP };
  if (id !== null && !isUuid(id)) return { error: "Invalid application." };
  const input = toInput(fd);
  const parsed = parseApplication(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const v = parsed.values;

  const { data: program } = await supabase.from("programs").select("id").eq("id", v.program_id).maybeSingle();
  if (!program) return { errors: { program_id: "That program no longer exists. Choose another." }, values: input };

  if (id) {
    const { data: cur } = await supabase.from("applications").select("status").eq("id", id).maybeSingle();
    if (!cur) return { error: "That application no longer exists.", values: input };
    if (cur.status !== v.status) {
      const t = canTransition(cur.status, v.status);
      if (!t.ok) return { errors: { status: t.reason }, values: input };
    }
  }

  if (!input.allow_duplicate) {
    const { data: same } = await supabase.from("applications").select("id,intake").eq("program_id", v.program_id).limit(50);
    const kind = duplicateKind(same ?? [], v.intake, id);
    if (kind) return {
      duplicate: true, values: input,
      error: kind === "same-intake" ? "An application for this program and intake already exists."
        : "You already have an application for this program (different intake). Save anyway if this is a separate cycle.",
    };
  }

  if (id === null) {
    const starters = fd.getAll("starter_requirements").filter((x): x is string => typeof x === "string" && (STARTER_REQUIREMENTS as readonly string[]).includes(x));
    const { data, error } = await supabase.rpc("create_application", { p_data: v, p_requirements: starters });
    if (error || typeof data !== "string") return { error: error ? dbMessage(error) : "Could not save.", values: input };
    refresh();
    redirect(`/applications/${data}`);
  }
  // A single UPDATE: if the status changed, the database trigger writes the history row in the same statement.
  const { data, error } = await supabase.from("applications").update(v).eq("id", id).select("id").maybeSingle();
  if (error) return { error: dbMessage(error), values: input };
  if (!data) return { error: "That application no longer exists.", values: input };
  refresh();
  redirect(`/applications/${id}`);
}

/** Status + (missing) submission/decision date + history, atomically, through the SQL function. */
export async function changeStatus(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid application." };
  const input = toInput(fd);
  const parsed = parseStatusChange(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const { data: cur } = await supabase.from("applications").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "That application no longer exists." };
  const t = canTransition(cur.status, parsed.values.status!);
  if (!t.ok) return { errors: { status: t.reason }, values: input };
  const { error } = await supabase.rpc("change_application_status", {
    p_id: id, p_status: parsed.values.status, p_note: parsed.values.note, p_today: todayIn(getTimezone()),
  });
  if (error) return { error: dbMessage(error), values: input };
  refresh();
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid application." };
  for (const table of ["tasks", "events"] as const) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("application_id", id);
    if (error) return { error: "Could not check related records. Try again." };
    if (count) return { error: `Cannot delete: ${count} ${table === "tasks" ? "task(s)" : "event(s)"} still belong to it. Remove or reassign those first.` };
  }
  // Cascades only this application's requirements, history and scholarship/document links.
  const { error } = await supabase.from("applications").delete().eq("id", id);
  if (error) return { error: error.code === "23503" ? "Cannot delete: other records still depend on it." : dbMessage(error) };
  refresh();
  redirect("/applications");
}

// ---- scholarship links (application_scholarships; separate from the Phase 5 research links) ------------
export async function linkApplicationScholarship(applicationId: string, fd: FormData): Promise<void> {
  const { supabase } = await requireOwner();
  const target = String(fd.get("target") ?? "");
  if (!isUuid(applicationId) || !isUuid(target)) throw new Error("Invalid link request.");
  const { error } = await supabase.from("application_scholarships").insert({ application_id: applicationId, scholarship_id: target });
  if (error && error.code !== "23505") throw new Error(error.code === "23503" ? "That scholarship or application no longer exists." : "Could not link.");
  refresh();
}

export async function unlinkApplicationScholarship(applicationId: string, scholarshipId: string): Promise<void> {
  const { supabase } = await requireOwner();
  if (!isUuid(applicationId) || !isUuid(scholarshipId)) throw new Error("Invalid link request.");
  const { error } = await supabase.from("application_scholarships").delete().eq("application_id", applicationId).eq("scholarship_id", scholarshipId);
  if (error) throw new Error("Could not unlink.");
  refresh();
}

export async function setScholarshipOutcome(applicationId: string, scholarshipId: string, fd: FormData): Promise<void> {
  const { supabase } = await requireOwner();
  const outcome = String(fd.get("outcome") ?? "");
  if (!isUuid(applicationId) || !isUuid(scholarshipId) || !SCHOLARSHIP_OUTCOMES.some((o) => o[0] === outcome)) throw new Error("Invalid request.");
  const { error } = await supabase.from("application_scholarships").update({ outcome }).eq("application_id", applicationId).eq("scholarship_id", scholarshipId);
  if (error) throw new Error("Could not update the scholarship outcome.");
  refresh();
}

// ---- requirements --------------------------------------------------------------------------------------
const MAX_REQUIREMENTS = 100;

export async function addRequirement(applicationId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  if (!isUuid(applicationId)) return { error: "Invalid application." };
  const input = toInput(fd);
  const parsed = parseRequirement(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const { data: last, count } = await supabase.from("application_requirements").select("sort_order", { count: "exact" }).eq("application_id", applicationId).order("sort_order", { ascending: false }).limit(1);
  if ((count ?? 0) >= MAX_REQUIREMENTS) return { error: `An application can have at most ${MAX_REQUIREMENTS} requirements.` };
  const { error } = await supabase.from("application_requirements").insert({ application_id: applicationId, ...parsed.values, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) return { error: dbMessage(error), values: input };
  refresh();
  return { ok: true };
}

export async function updateRequirement(applicationId: string, requirementId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  if (!isUuid(applicationId) || !isUuid(requirementId)) return { error: "Invalid requirement." };
  const input = toInput(fd);
  const parsed = parseRequirement(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const { data, error } = await supabase.from("application_requirements").update(parsed.values).eq("id", requirementId).eq("application_id", applicationId).select("id").maybeSingle();
  if (error) return { error: dbMessage(error), values: input };
  if (!data) return { error: "That requirement no longer exists.", values: input };
  refresh();
  return { ok: true };
}

export async function setRequirementComplete(applicationId: string, requirementId: string, complete: boolean): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(applicationId) || !isUuid(requirementId)) return { error: "Invalid requirement." };
  const { data, error } = await supabase.from("application_requirements").update({ is_complete: complete === true }).eq("id", requirementId).eq("application_id", applicationId).select("id").maybeSingle();
  if (error || !data) return { error: error ? dbMessage(error) : "That requirement no longer exists." };
  refresh();
  return {};
}

export async function deleteRequirement(applicationId: string, requirementId: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  if (!isUuid(applicationId) || !isUuid(requirementId)) return { error: "Invalid requirement." };
  const { error } = await supabase.from("application_requirements").delete().eq("id", requirementId).eq("application_id", applicationId);
  if (error) return { error: dbMessage(error) };
  refresh();
  return {};
}
