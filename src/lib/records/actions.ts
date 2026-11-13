"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth/session";
import { hasExtras } from "./queries";
import { escapeLike } from "./params";
import { isUuid, parseProgram, parseScholarship, parseUniversity, type Errors, type Input } from "./validate";

// Every action starts with requireOwner() (session + owner check) and validates on the server.
// user_id is never accepted from the client: the column defaults to auth.uid() and RLS pins it.
export type FormState = { error?: string; errors?: Errors; duplicate?: boolean; values?: Input };
export type DeleteState = { error?: string };

const toInput = (fd: FormData): Input => {
  const o: Input = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) o[k] = v;
  return o;
};
// Writes invalidate the whole app so lists, details and the dashboard never serve stale data.
const refresh = () => revalidatePath("/", "layout");
const dbMessage = (e: { code?: string }) =>
  e.code === "23503" ? "A referenced record does not exist or is still in use."
    : e.code === "23505" ? "That record already exists."
      : e.code === "23514" ? "A value was rejected by a database rule."
        : e.code === "42501" ? "You do not have permission to do that."
          : "Could not save. Check your connection and try again.";

type Table = "universities" | "programs" | "scholarships";
async function save(db: SupabaseClient, table: Table, id: string | null, values: object, input: Input, path: string): Promise<FormState> {
  const q = id ? db.from(table).update(values).eq("id", id) : db.from(table).insert(values);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) return { error: dbMessage(error), values: input };
  if (!data) return { error: "That record no longer exists.", values: input };
  refresh();
  redirect(`${path}/${data.id}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exists(db: SupabaseClient, table: Table, filter: (q: any) => any, id: string | null) {
  let q = filter(db.from(table).select("id", { count: "exact", head: true }));
  if (id) q = q.neq("id", id);
  const { count } = await q;
  return (count ?? 0) > 0;
}

const dupMessage = "A similar record already exists. Save anyway if this is a different one.";

export async function saveUniversity(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  if (id !== null && !isUuid(id)) return { error: "Invalid record." };
  const input = toInput(fd);
  const parsed = parseUniversity(input, await hasExtras(supabase));
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const v = parsed.values as { name: string; country: string };
  if (!input.allow_duplicate && await exists(supabase, "universities", (q) => q.ilike("name", escapeLike(v.name)).ilike("country", escapeLike(v.country)), id))
    return { duplicate: true, error: dupMessage, values: input };
  return save(supabase, "universities", id, parsed.values, input, "/universities");
}

export async function saveProgram(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  if (id !== null && !isUuid(id)) return { error: "Invalid record." };
  const input = toInput(fd);
  const parsed = parseProgram(input);
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const v = parsed.values;
  // Explicit ownership/existence check gives a clear message; the composite FK + RLS enforce it regardless.
  const { data: uni } = await supabase.from("universities").select("id").eq("id", v.university_id).maybeSingle();
  if (!uni) return { errors: { university_id: "Choose a valid university." }, values: input };
  if (!input.allow_duplicate && await exists(supabase, "programs", (q) => q.eq("university_id", v.university_id).ilike("name", escapeLike(v.name as string)).eq("degree_type", v.degree_type), id))
    return { duplicate: true, error: dupMessage, values: input };
  return save(supabase, "programs", id, v, input, "/programs");
}

export async function saveScholarship(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireOwner();
  if (id !== null && !isUuid(id)) return { error: "Invalid record." };
  const input = toInput(fd);
  const parsed = parseScholarship(input, await hasExtras(supabase));
  if (!parsed.ok) return { errors: parsed.errors, values: input };
  const v = parsed.values as { name: string; provider: string | null };
  if (!input.allow_duplicate && await exists(supabase, "scholarships", (q) => {
    const base = q.ilike("name", escapeLike(v.name));
    return v.provider ? base.ilike("provider", escapeLike(v.provider)) : base.is("provider", null);
  }, id)) return { duplicate: true, error: dupMessage, values: input };
  return save(supabase, "scholarships", id, parsed.values, input, "/scholarships");
}

async function count(db: SupabaseClient, table: string, col: string, id: string) {
  const { count: n, error } = await db.from(table).select(col, { count: "exact", head: true }).eq(col, id);
  return error ? null : n ?? 0;
}

async function remove(table: Table, id: string, dependents: [table: string, col: string, noun: string][], back: string): Promise<DeleteState> {
  const { supabase } = await requireOwner();
  if (!isUuid(id)) return { error: "Invalid record." };
  for (const [t, col, noun] of dependents) {
    const n = await count(supabase, t, col, id);
    if (n === null) return { error: "Could not check related records. Try again." };
    if (n > 0) return { error: `Cannot delete: it still has ${n} ${noun}. Remove or reassign those first.` };
  }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.code === "23503" ? "Cannot delete: other records still depend on it." : dbMessage(error) };
  refresh();
  redirect(back);
}

export async function deleteUniversity(id: string): Promise<DeleteState> { return remove("universities", id, [["programs", "university_id", "master's program(s)"]], "/universities"); }
export async function deleteProgram(id: string): Promise<DeleteState> { return remove("programs", id, [["applications", "program_id", "application(s)"]], "/programs"); }
export async function deleteScholarship(id: string): Promise<DeleteState> { return remove("scholarships", id, [["application_scholarships", "scholarship_id", "application(s) using it"]], "/scholarships"); }

// Linking (needs the Phase 5 migration). Used as <form action>, so failures throw to error.tsx.
export async function linkScholarship(scholarshipId: string, kind: "program" | "university", fd: FormData): Promise<void> {
  const { supabase } = await requireOwner();
  const target = String(fd.get("target") ?? "");
  if (!isUuid(scholarshipId) || !isUuid(target) || (kind !== "program" && kind !== "university")) throw new Error("Invalid link request.");
  if (!(await hasExtras(supabase))) throw new Error("Linking requires the Phase 5 database migration.");
  const { error } = kind === "program"
    ? await supabase.from("scholarship_programs").insert({ scholarship_id: scholarshipId, program_id: target })
    : await supabase.from("scholarship_universities").insert({ scholarship_id: scholarshipId, university_id: target });
  if (error && error.code !== "23505") throw new Error(error.code === "23503" ? "That record does not exist." : "Could not link.");
  refresh();
}

export async function unlinkScholarship(scholarshipId: string, kind: "program" | "university", targetId: string): Promise<void> {
  const { supabase } = await requireOwner();
  if (!isUuid(scholarshipId) || !isUuid(targetId) || (kind !== "program" && kind !== "university")) throw new Error("Invalid link request.");
  const { error } = kind === "program"
    ? await supabase.from("scholarship_programs").delete().eq("scholarship_id", scholarshipId).eq("program_id", targetId)
    : await supabase.from("scholarship_universities").delete().eq("scholarship_id", scholarshipId).eq("university_id", targetId);
  if (error) throw new Error("Could not unlink.");
  refresh();
}
