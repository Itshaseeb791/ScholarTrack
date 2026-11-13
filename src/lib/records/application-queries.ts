import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "../time";
import type { ListParams } from "./params";
import { isUuid } from "./validate";

type DB = SupabaseClient;
export const APP_SORTS = ["deadline", "updated", "created", "university"] as const;
export const APP_FILTERS = ["status", "country", "university", "intake", "deadline"] as const;

export type OverviewRow = {
  id: string; program_id: string; status: string; application_deadline: string | null; portal_url: string | null;
  reference_number: string | null; application_fee: number | null; currency: string | null; intake: string | null;
  submission_date: string | null; decision_date: string | null; expected_response_date: string | null; notes: string | null;
  created_at: string; updated_at: string; program_name: string; program_deadline: string | null; university_id: string;
  university_name: string; university_country: string; effective_deadline: string | null;
  requirements_total: number; requirements_done: number;
};

function fail(error: { code?: string } | null): asserts error is null {
  if (error) throw new Error("Query failed: " + (error.code ?? "unknown"));
}

/** True once the Phase 6 migration is applied. One cheap probe per request. */
export const hasPhase6 = cache(async (db: DB) => {
  const { error } = await db.from("application_status_history").select("id").limit(0);
  return !error;
});

const or = (q: string, cols: string[]) => cols.map((c) => `${c}.ilike.%${q}%`).join(",");

export async function listApplications(db: DB, p: ListParams, today: string) {
  let q = db.from("application_overview").select("*", { count: "exact" });
  if (p.q) q = q.or(or(p.q, ["university_name", "program_name", "reference_number"]));
  const f = p.filters;
  if (f.status) q = q.eq("status", f.status);
  if (f.country) q = q.eq("university_country", f.country);
  if (f.university && isUuid(f.university)) q = q.eq("university_id", f.university);
  if (f.intake) q = q.eq("intake", f.intake);
  if (f.deadline === "open") q = q.gte("effective_deadline", today);
  else if (f.deadline === "30") q = q.gte("effective_deadline", today).lte("effective_deadline", addDays(today, 30));
  else if (f.deadline === "past") q = q.lt("effective_deadline", today);
  else if (f.deadline === "none") q = q.is("effective_deadline", null);
  q = p.sort === "updated" ? q.order("updated_at", { ascending: false })
    : p.sort === "created" ? q.order("created_at", { ascending: false })
      : p.sort === "university" ? q.order("university_name").order("program_name")
        : q.order("effective_deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, count, error } = await q.range(p.from, p.to);
  fail(error);
  return { rows: (data ?? []) as OverviewRow[], total: count ?? 0 };
}

/** Distinct values for filter dropdowns (bounded; personal-scale data). */
export async function overviewOptions(db: DB) {
  const { data, error } = await db.from("application_overview").select("university_id,university_name,university_country,intake").limit(1000);
  fail(error);
  const rows = data ?? [];
  const unis = new Map<string, string>(); const countries = new Set<string>(); const intakes = new Set<string>();
  for (const r of rows) { unis.set(r.university_id, r.university_name); countries.add(r.university_country); if (r.intake) intakes.add(r.intake); }
  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    universities: [...unis].sort((a, b) => sort(a[1], b[1])), countries: [...countries].sort(sort), intakes: [...intakes].sort(sort),
  };
}

export type Requirement = { id: string; title: string; notes: string | null; due_date: string | null; is_complete: boolean; completed_at: string | null; sort_order: number };
export type HistoryRow = { id: string; from_status: string | null; to_status: string; note: string | null; changed_at: string };
export type LinkedScholarship = {
  scholarship_id: string; outcome: string;
  scholarships: { id: string; name: string; provider: string | null; funding_type: string | null; application_deadline: string | null } | null;
};

export async function getApplicationBundle(db: DB, id: string) {
  const { data: app, error } = await db.from("application_overview").select("*").eq("id", id).maybeSingle();
  fail(error);
  if (!app) return null;
  const [reqs, hist, links, all] = await Promise.all([
    db.from("application_requirements").select("id,title,notes,due_date,is_complete,completed_at,sort_order").eq("application_id", id).order("sort_order").order("created_at"),
    db.from("application_status_history").select("id,from_status,to_status,note,changed_at").eq("application_id", id).order("changed_at", { ascending: false }).limit(100),
    db.from("application_scholarships").select("scholarship_id,outcome,scholarships(id,name,provider,funding_type,application_deadline)").eq("application_id", id),
    db.from("scholarships").select("id,name,country").order("name").limit(500),
  ]);
  for (const r of [reqs, hist, links, all]) fail(r.error);
  const linked = (links.data ?? []) as unknown as LinkedScholarship[];
  return {
    app: app as OverviewRow,
    requirements: (reqs.data ?? []) as Requirement[],
    history: (hist.data ?? []) as HistoryRow[],
    linked,
    available: ((all.data ?? []) as { id: string; name: string; country: string | null }[]).filter((s) => !linked.some((l) => l.scholarship_id === s.id)),
  };
}

/** Programs grouped by university for the single "program" picker. */
export async function programGroups(db: DB) {
  const { data, error } = await db.from("programs").select("id,name,intake,universities!inner(id,name,country)").order("name").limit(1000);
  fail(error);
  const groups = new Map<string, { label: string; options: (readonly [string, string])[] }>();
  for (const p of (data ?? []) as unknown as { id: string; name: string; intake: string | null; universities: { id: string; name: string; country: string } }[]) {
    const u = p.universities;
    const g = groups.get(u.id) ?? { label: `${u.name} (${u.country})`, options: [] };
    g.options.push([p.id, p.intake ? `${p.name} · ${p.intake}` : p.name] as const);
    groups.set(u.id, g);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}
