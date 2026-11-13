import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListParams } from "./params";
import { addDays } from "../time";

type DB = SupabaseClient;
export type Row = Record<string, unknown> & { id: string };
export const SORTS = {
  universities: ["name", "recent"], programs: ["deadline", "name", "recent"], scholarships: ["deadline", "recent", "name"],
} as const;
export const FILTERS = {
  universities: ["country", "preferred"], programs: ["university", "country", "degree", "field"], scholarships: ["country", "funding", "deadline"],
} as const;

function fail(error: { code?: string } | null): asserts error is null {
  if (error) throw new Error("Query failed: " + (error.code ?? "unknown"));
}

/** True once the Phase 5 migration is applied (junction tables + new columns). One cheap probe per request. */
export const hasExtras = cache(async (db: DB) => {
  const { error } = await db.from("scholarship_programs").select("scholarship_id").limit(0);
  return !error;
});

const or = (q: string, cols: string[]) => cols.map((c) => `${c}.ilike.%${q}%`).join(",");

export async function listUniversities(db: DB, p: ListParams, extras: boolean) {
  let q = db.from("universities").select("*, programs(count)", { count: "exact" });
  if (p.q) q = q.or(or(p.q, ["name", "country", "city"]));
  if (p.filters.country) q = q.eq("country", p.filters.country);
  if (extras && p.filters.preferred === "1") q = q.eq("is_preferred", true);
  q = p.sort === "recent" ? q.order("created_at", { ascending: false }) : q.order("name").order("created_at");
  const { data, count, error } = await q.range(p.from, p.to);
  fail(error);
  return { rows: (data ?? []) as unknown as (Row & { programs: { count: number }[] })[], total: count ?? 0 };
}

export async function listPrograms(db: DB, p: ListParams) {
  let q = db.from("programs").select("*, universities!inner(id,name,country)", { count: "exact" });
  if (p.q) {
    // PostgREST cannot OR across an embedded table, so resolve matching universities first.
    const { data: hits } = await db.from("universities").select("id").or(or(p.q, ["name", "country"])).limit(50);
    const ids = (hits ?? []).map((h) => h.id);
    q = q.or([or(p.q, ["name", "field_of_study"]), ids.length ? `university_id.in.(${ids.join(",")})` : ""].filter(Boolean).join(","));
  }
  const f = p.filters;
  if (f.university && /^[0-9a-f-]{36}$/i.test(f.university)) q = q.eq("university_id", f.university);
  if (f.country) q = q.eq("universities.country", f.country);
  if (f.degree) q = q.eq("degree_type", f.degree);
  if (f.field) q = q.ilike("field_of_study", `%${f.field.replace(/[\\%_]/g, "\\$&")}%`);
  q = p.sort === "recent" ? q.order("created_at", { ascending: false })
    : p.sort === "name" ? q.order("name") : q.order("application_deadline", { ascending: true, nullsFirst: false }).order("name");
  const { data, count, error } = await q.range(p.from, p.to);
  fail(error);
  return { rows: (data ?? []) as unknown as (Row & { universities: { id: string; name: string; country: string } })[], total: count ?? 0 };
}

export async function listScholarships(db: DB, p: ListParams, today: string) {
  let q = db.from("scholarships").select("*", { count: "exact" });
  if (p.q) q = q.or(or(p.q, ["name", "provider", "country"]));
  const f = p.filters;
  if (f.country) q = q.eq("country", f.country);
  if (f.funding) q = q.eq("funding_type", f.funding);
  if (f.deadline === "open") q = q.gte("application_deadline", today);
  else if (f.deadline === "30") q = q.gte("application_deadline", today).lte("application_deadline", addDays(today, 30));
  else if (f.deadline === "past") q = q.lt("application_deadline", today);
  else if (f.deadline === "none") q = q.is("application_deadline", null);
  q = p.sort === "recent" ? q.order("created_at", { ascending: false })
    : p.sort === "name" ? q.order("name") : q.order("application_deadline", { ascending: true, nullsFirst: false }).order("name");
  const { data, count, error } = await q.range(p.from, p.to);
  fail(error);
  return { rows: (data ?? []) as Row[], total: count ?? 0 };
}

/** Distinct non-empty values of one column, for filter dropdowns (bounded; personal-scale data). */
export async function distinct(db: DB, table: "universities" | "scholarships", col: "country"): Promise<string[]> {
  const { data, error } = await db.from(table).select(col).not(col, "is", null).limit(1000);
  fail(error);
  return [...new Set((data ?? []).map((r) => String((r as unknown as Record<string, string>)[col])))].sort((a, b) => a.localeCompare(b));
}

export async function universityOptions(db: DB) {
  const { data, error } = await db.from("universities").select("id,name,country").order("name").limit(500);
  fail(error);
  return (data ?? []) as { id: string; name: string; country: string }[];
}

export async function getRow(db: DB, table: string, id: string, select = "*") {
  const { data, error } = await db.from(table).select(select).eq("id", id).maybeSingle();
  fail(error);
  return data as unknown as Row | null;
}
