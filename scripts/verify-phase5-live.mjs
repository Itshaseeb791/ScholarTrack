// Phase 5 live data-layer checks against the real Supabase project (owner + optional non-owner sessions).
// Every record is prefixed "ZZ-P5-TEST" and removed in finally. Existing records are never touched.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_TEST_OWNER_EMAIL: email, SUPABASE_TEST_OWNER_PASSWORD: pw } = process.env;
if (!url || !key || !email || !pw) { console.error("BLOCKED: missing Supabase test environment entries"); process.exit(1); }
const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = mk(), anon = mk(), other = mk();
const TAG = "ZZ-P5-TEST " + Date.now();
const made = { programs: [], scholarships: [], universities: [] };
let failures = 0, skipped = 0;
const check = (cond, msg) => { if (cond) console.log("PASS: " + msg); else { failures++; console.log("FAIL: " + msg); } };
const skip = (msg) => { skipped++; console.log("SKIP: " + msg); };

try {
  const { error: le } = await owner.auth.signInWithPassword({ email, password: pw });
  check(!le, "owner sign-in");
  const probe = await owner.from("scholarship_programs").select("scholarship_id").limit(0);
  const extras = !probe.error;
  console.log(`INFO: Phase 5 migration applied: ${extras}`);

  // ---- University CRUD
  let r = await owner.from("universities").insert({ name: TAG + " Uni", country: "Testland", city: "Testville", website: "https://example.edu" }).select().single();
  check(!r.error && r.data.user_id === process.env.SUPABASE_OWNER_ID, "university create (user_id defaults to owner)");
  const uni = r.data; made.universities.push(uni.id);
  r = await owner.from("universities").update({ city: "Newtown" }).eq("id", uni.id).select().single();
  check(r.data?.city === "Newtown" && r.data.updated_at > uni.updated_at, "university update + updated_at trigger");
  r = await owner.from("universities").insert({ name: " ", country: "X" });
  check(r.error?.code === "23514", "blank university name rejected by DB");
  r = await owner.from("universities").insert({ name: "x", country: "X", website: "javascript:alert(1)" });
  check(r.error?.code === "23514", "non-http website rejected by DB");
  r = await owner.from("universities").insert({ name: "x", country: "X", user_id: "00000000-0000-4000-8000-000000000000" });
  check(!!r.error, "client-supplied foreign user_id rejected by RLS");

  // ---- Program CRUD + FK
  r = await owner.from("programs").insert({ university_id: uni.id, name: TAG + " MSc", degree_type: "msc", tuition_fee: 1000, currency: "EUR", application_deadline: "2026-12-31" }).select().single();
  check(!r.error && r.data.application_deadline === "2026-12-31", "program create; date-only value round-trips unchanged");
  const prog = r.data; made.programs.push(prog.id);
  r = await owner.from("programs").insert({ university_id: "00000000-0000-4000-8000-000000000000", name: TAG + " orphan" });
  check(r.error?.code === "23503", "program with invalid university rejected (FK)");
  r = await owner.from("programs").insert({ university_id: uni.id, name: TAG + " nocur", tuition_fee: 5 });
  check(r.error?.code === "23514", "tuition without currency rejected");
  r = await owner.from("programs").select("*, universities!inner(name,country)").eq("universities.country", "Testland").ilike("name", "%" + TAG + "%");
  check(!r.error && r.data.length === 1, "program list joins university and filters by country");
  const hit = await owner.from("universities").select("id").ilike("name", "%" + TAG + "%");
  r = await owner.from("programs").select("id, universities!inner(name)").or(`name.ilike.%zzz-nomatch%,university_id.in.(${hit.data.map((h) => h.id).join(",")})`);
  check(!r.error && r.data.length === 1, "program search by university name (id-set OR) works");

  // ---- Deletion restrictions
  r = await owner.from("universities").delete().eq("id", uni.id);
  check(r.error?.code === "23503", "deleting a university with programs is restricted by the DB");

  // ---- Scholarship CRUD (quick add = name only)
  r = await owner.from("scholarships").insert({ name: TAG + " Quick" }).select().single();
  check(!r.error && r.data.funding_amount === null && r.data.application_deadline === null, "scholarship quick add with name only");
  const quick = r.data; made.scholarships.push(quick.id);
  r = await owner.from("scholarships").update({ provider: "Prov", country: "Testland", funding_type: "full", application_deadline: "2027-01-15" }).eq("id", quick.id).select().single();
  check(r.data?.provider === "Prov", "scholarship completed later via update");
  r = await owner.from("scholarships").insert({ name: TAG + " bad", funding_amount: 5 });
  check(r.error?.code === "23514", "funding amount without currency rejected");

  // ---- Relationships
  if (extras) {
    r = await owner.from("scholarship_programs").insert({ scholarship_id: quick.id, program_id: prog.id });
    check(!r.error, "link scholarship to program");
    r = await owner.from("scholarship_programs").insert({ scholarship_id: quick.id, program_id: prog.id });
    check(r.error?.code === "23505", "duplicate link rejected");
    r = await owner.from("scholarship_universities").insert({ scholarship_id: quick.id, university_id: uni.id });
    check(!r.error, "link scholarship to university");
    r = await owner.from("scholarship_programs").insert({ scholarship_id: quick.id, program_id: "00000000-0000-4000-8000-000000000000" });
    check(r.error?.code === "23503", "link to invalid program rejected");
    r = await owner.from("scholarships").select("name, scholarship_programs(programs(name))").eq("id", quick.id).single();
    check(r.data?.scholarship_programs?.[0]?.programs?.name === TAG + " MSc", "relationship readable through embed");
    r = await owner.from("scholarship_programs").delete().eq("scholarship_id", quick.id).eq("program_id", prog.id);
    check(!r.error, "unlink program");
  } else skip("relationship tests need migration 20261113000100_phase5_relationships.sql");

  // ---- Owner-only access
  const a = await anon.from("universities").select("id").eq("id", uni.id);
  check(a.error || a.data.length === 0, "anonymous cannot read university");
  const ao = await anon.from("universities").insert({ name: "x", country: "x" });
  check(!!ao.error, "anonymous cannot insert");
  if (process.env.SUPABASE_TEST_NON_OWNER_EMAIL && process.env.SUPABASE_TEST_NON_OWNER_PASSWORD) {
    const { error: oe } = await other.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_NON_OWNER_EMAIL, password: process.env.SUPABASE_TEST_NON_OWNER_PASSWORD });
    if (oe) skip("non-owner sign-in unavailable");
    else {
      const x = await other.from("universities").select("id").eq("id", uni.id);
      check(!x.error && x.data.length === 0, "non-owner cannot read owner university");
      const y = await other.from("universities").update({ city: "hacked" }).eq("id", uni.id).select();
      check(!y.data?.length, "non-owner cannot update owner university");
      const z = await other.from("scholarships").insert({ name: "x" });
      check(!!z.error, "non-owner cannot insert");
    }
  } else skip("non-owner credentials not configured");
} catch (e) {
  failures++; console.log("FAIL: unexpected error: " + (e.message ?? e));
} finally {
  // children first
  for (const t of ["scholarships", "programs", "universities"]) {
    for (const id of made[t]) { const { error } = await owner.from(t).delete().eq("id", id); if (error) { failures++; console.log(`FAIL: cleanup ${t} ${id}: ${error.code}`); } }
  }
  const leftovers = await owner.from("universities").select("id", { count: "exact", head: true }).ilike("name", "ZZ-P5-TEST%");
  console.log(`CLEANUP: leftover test universities = ${leftovers.count}`);
}
console.log(`\n${failures ? "FAILED" : "OK"}: ${failures} failure(s), ${skipped} skipped`);
process.exit(failures ? 1 : 0);
