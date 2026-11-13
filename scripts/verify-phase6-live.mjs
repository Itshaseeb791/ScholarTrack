// Phase 6 live data-layer checks against the real Supabase project (needs migration 20261114000100 applied).
// Every record is prefixed "ZZ-P6-TEST" and removed in finally. Existing records are never touched.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_TEST_OWNER_EMAIL: email, SUPABASE_TEST_OWNER_PASSWORD: pw } = process.env;
if (!url || !key || !email || !pw) { console.error("BLOCKED: missing Supabase test environment entries"); process.exit(1); }
const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = mk(), anon = mk(), other = mk();
const TAG = "ZZ-P6-TEST " + Date.now();
const ids = { applications: [], scholarships: [], programs: [], universities: [] };
let failures = 0, skipped = 0;
const check = (cond, msg) => { if (cond) console.log("PASS: " + msg); else { failures++; console.log("FAIL: " + msg); } };
const skip = (msg) => { skipped++; console.log("SKIP: " + msg); };
const today = new Date().toISOString().slice(0, 10);
const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const history = async (id) => (await owner.from("application_status_history").select("from_status,to_status,note").eq("application_id", id).order("changed_at")).data ?? [];
const create = async (data, reqs = []) => { const r = await owner.rpc("create_application", { p_data: data, p_requirements: reqs }); if (typeof r.data === "string") ids.applications.push(r.data); return r; };

try {
  const { error: le } = await owner.auth.signInWithPassword({ email, password: pw });
  check(!le, "owner sign-in");
  const probe = await owner.from("application_status_history").select("id").limit(0);
  if (probe.error) { console.log("BLOCKED: Phase 6 migration is not applied (" + probe.error.code + ")"); process.exit(2); }

  // ---- fixtures
  const uni = (await owner.from("universities").insert({ name: TAG + " Uni", country: "Testland" }).select().single()).data; ids.universities.push(uni.id);
  const prog = (await owner.from("programs").insert({ university_id: uni.id, name: TAG + " MSc", application_deadline: D(60) }).select().single()).data; ids.programs.push(prog.id);
  const schA = (await owner.from("scholarships").insert({ name: TAG + " Sch A" }).select().single()).data; ids.scholarships.push(schA.id);
  const schB = (await owner.from("scholarships").insert({ name: TAG + " Sch B" }).select().single()).data; ids.scholarships.push(schB.id);

  // ---- create (atomic application + checklist + initial history)
  let r = await create({ program_id: prog.id, intake: "Fall 2027", reference_number: "REF-1", notes: "n" }, ["Statement of purpose", "CV / resume", "  "]);
  check(!r.error && typeof r.data === "string", "create_application returns the new id");
  const a1 = r.data;
  const row = (await owner.from("applications").select("*").eq("id", a1).single()).data;
  check(row.status === "researching" && row.intake === "Fall 2027" && row.user_id === process.env.SUPABASE_OWNER_ID, "application stored with defaults; user_id is the owner");
  check((await owner.from("application_requirements").select("id", { count: "exact", head: true }).eq("application_id", a1)).count === 2, "starter checklist created (blank titles ignored)");
  let h = await history(a1);
  check(h.length === 1 && h[0].from_status === null && h[0].to_status === "researching", "initial history row written by the trigger");

  // ---- atomicity of creation
  const before = (await owner.from("applications").select("id", { count: "exact", head: true }).eq("program_id", prog.id)).count;
  r = await create({ program_id: prog.id }, ["x".repeat(301)]);
  check(!!r.error && (await owner.from("applications").select("id", { count: "exact", head: true }).eq("program_id", prog.id)).count === before, "invalid checklist item rolls back the whole creation");
  r = await create({ program_id: "00000000-0000-4000-8000-000000000000" });
  check(r.error?.code === "23503", "application for a non-existent program rejected (FK)");
  r = await create({});
  check(!!r.error, "application without a program rejected");
  r = await create({ program_id: prog.id, application_fee: 10 });
  check(r.error?.code === "23514", "fee without currency rejected");
  r = await create({ program_id: prog.id, portal_url: "javascript:alert(1)" });
  check(r.error?.code === "23514", "non-http portal URL rejected");
  r = await create({ program_id: prog.id, status: "bogus" });
  check(r.error?.code === "23514", "invalid status rejected");
  r = await create({ program_id: prog.id, status: "waitlisted", intake: "Spring 2028" });
  check(!r.error, "waitlisted status accepted; second application for the same program (different intake) allowed");

  // ---- status change: atomic status + date + history
  r = await owner.rpc("change_application_status", { p_id: a1, p_status: "submitted", p_note: "Sent via portal", p_today: today });
  check(!r.error, "change_application_status succeeds");
  const after = (await owner.from("applications").select("status,submission_date,decision_date").eq("id", a1).single()).data;
  h = await history(a1);
  check(after.status === "submitted" && after.submission_date === today && after.decision_date === null, "status updated and missing submission date filled with the caller's day");
  check(h.length === 2 && h[1].from_status === "researching" && h[1].to_status === "submitted" && h[1].note === "Sent via portal", "history row has previous status, new status and note");
  r = await owner.rpc("change_application_status", { p_id: a1, p_status: "submitted", p_today: today });
  check(r.error?.code === "22023" && (await history(a1)).length === 2, "setting the same status is rejected and writes no history");
  r = await owner.rpc("change_application_status", { p_id: a1, p_status: "nonsense", p_today: today });
  check(!!r.error && (await history(a1)).length === 2 && (await owner.from("applications").select("status").eq("id", a1).single()).data.status === "submitted", "invalid status: nothing changes, no history row (atomic)");
  r = await owner.rpc("change_application_status", { p_id: "00000000-0000-4000-8000-000000000000", p_status: "submitted" });
  check(r.error?.code === "P0002", "unknown application id reports not found");
  await owner.rpc("change_application_status", { p_id: a1, p_status: "accepted", p_today: D(5) });
  const acc = (await owner.from("applications").select("submission_date,decision_date").eq("id", a1).single()).data;
  check(acc.submission_date === today && acc.decision_date === D(5), "accepted sets the decision date; the submission date is untouched");
  await owner.rpc("change_application_status", { p_id: a1, p_status: "rejected", p_today: D(9) });
  check((await owner.from("applications").select("decision_date").eq("id", a1).single()).data.decision_date === D(5), "later status changes never overwrite an existing decision date");
  // manual date is preserved
  const a2 = (await create({ program_id: prog.id, intake: "Manual", submission_date: D(-3) })).data;
  await owner.rpc("change_application_status", { p_id: a2, p_status: "submitted", p_today: today });
  check((await owner.from("applications").select("submission_date").eq("id", a2).single()).data.submission_date === D(-3), "manually entered submission date is preserved");
  // edit-form path: a plain UPDATE of status still gets a history row from the trigger
  await owner.from("applications").update({ status: "interview" }).eq("id", a2);
  h = await history(a2);
  check(h.at(-1).to_status === "interview" && h.at(-1).from_status === "submitted", "direct status UPDATE (edit form) is also recorded by the trigger");
  await owner.from("applications").update({ notes: "only notes" }).eq("id", a2);
  check((await history(a2)).length === h.length, "non-status updates add no history");
  // history is append-only for the app
  const del = await owner.from("application_status_history").delete().eq("application_id", a2).select();
  const upd = await owner.from("application_status_history").update({ note: "forged" }).eq("application_id", a2).select();
  check((!!del.error || !del.data?.length) && (!!upd.error || !upd.data?.length) && (await history(a2)).length === h.length, "history cannot be edited or deleted through the API");
  const forged = await owner.from("application_status_history").insert({ application_id: a2, user_id: "00000000-0000-4000-8000-000000000000", to_status: "accepted" });
  check(!!forged.error, "history insert with a foreign user_id rejected by RLS");

  // ---- deadlines: override precedence, program untouched
  const a3 = (await create({ program_id: prog.id, intake: "Override", application_deadline: D(10) })).data;
  let ov = (await owner.from("application_overview").select("effective_deadline,program_deadline,university_name,university_country,requirements_total").eq("id", a3).single()).data;
  check(ov.effective_deadline === D(10) && ov.program_deadline === D(60), "overview: application deadline overrides the program deadline");
  const nodl = (await create({ program_id: prog.id, intake: "Fallback" })).data;
  ov = (await owner.from("application_overview").select("effective_deadline").eq("id", nodl).single()).data;
  check(ov.effective_deadline === D(60), "overview: falls back to the program deadline");
  check((await owner.from("programs").select("application_deadline").eq("id", prog.id).single()).data.application_deadline === D(60), "program deadline is never modified by application deadlines");
  let q = await owner.from("application_overview").select("id").or(`university_name.ilike.%${TAG}%,program_name.ilike.%zzz%,reference_number.ilike.%zzz%`);
  check(!q.error && q.data.length >= 4, "overview search across university/program/reference");
  q = await owner.from("application_overview").select("id").eq("university_country", "Testland").eq("status", "waitlisted");
  check(!q.error && q.data.length === 1, "overview filters combine (country + status)");
  q = await owner.from("application_overview").select("id,effective_deadline").eq("university_id", uni.id).order("effective_deadline", { ascending: true, nullsFirst: false });
  check(!q.error && q.data[0].effective_deadline === D(10), "overview sorts by effective deadline");

  // ---- requirements
  r = await owner.from("application_requirements").insert({ application_id: a3, title: "Transcripts", due_date: D(5), sort_order: 1 }).select().single();
  check(!r.error && r.data.is_complete === false && r.data.completed_at === null, "requirement created");
  const rq = r.data;
  r = await owner.from("application_requirements").update({ is_complete: true }).eq("id", rq.id).select().single();
  check(r.data?.is_complete === true && !!r.data.completed_at, "completing a requirement stamps completed_at");
  r = await owner.from("application_requirements").update({ is_complete: false }).eq("id", rq.id).select().single();
  check(r.data?.completed_at === null, "un-completing clears completed_at");
  await owner.from("application_requirements").update({ is_complete: true }).eq("id", rq.id);
  await owner.from("application_requirements").insert({ application_id: a3, title: "SOP", sort_order: 2 });
  ov = (await owner.from("application_overview").select("requirements_total,requirements_done").eq("id", a3).single()).data;
  check(ov.requirements_total === 2 && ov.requirements_done === 1, "overview counts requirements (1 of 2 complete)");
  r = await owner.from("application_requirements").insert({ application_id: "00000000-0000-4000-8000-000000000000", title: "x" });
  check(r.error?.code === "23503", "requirement for a non-existent application rejected");
  r = await owner.from("application_requirements").insert({ application_id: a3, title: "   " });
  check(r.error?.code === "23514", "blank requirement title rejected");
  r = await owner.from("application_requirements").update({ title: "Official transcripts", notes: "n" }).eq("id", rq.id).select().single();
  check(r.data?.title === "Official transcripts", "requirement edited");
  r = await owner.from("application_requirements").delete().eq("id", rq.id);
  check(!r.error && (await owner.from("application_requirements").select("id", { count: "exact", head: true }).eq("application_id", a3)).count === 1, "requirement deleted");

  // ---- scholarship links and outcomes (application_scholarships)
  r = await owner.from("application_scholarships").insert({ application_id: a3, scholarship_id: schA.id });
  check(!r.error, "link scholarship to application");
  r = await owner.from("application_scholarships").insert({ application_id: a3, scholarship_id: schA.id });
  check(r.error?.code === "23505", "duplicate link rejected");
  r = await owner.from("application_scholarships").insert({ application_id: a3, scholarship_id: "00000000-0000-4000-8000-000000000000" });
  check(r.error?.code === "23503", "link to a non-existent scholarship rejected");
  r = await owner.from("application_scholarships").insert({ application_id: a1, scholarship_id: schA.id });
  check(!r.error, "one scholarship can be linked to several applications");
  r = await owner.from("application_scholarships").select("outcome").eq("application_id", a3).eq("scholarship_id", schA.id).single();
  check(r.data?.outcome === "not_applied", "scholarship outcome defaults to not_applied");
  r = await owner.from("application_scholarships").update({ outcome: "awarded" }).eq("application_id", a3).eq("scholarship_id", schA.id).select().single();
  check(r.data?.outcome === "awarded" && (await owner.from("applications").select("status").eq("id", a3).single()).data.status === "researching", "scholarship outcome is independent of the admission status");
  r = await owner.from("application_scholarships").update({ outcome: "maybe" }).eq("application_id", a3).eq("scholarship_id", schA.id);
  check(r.error?.code === "23514", "invalid scholarship outcome rejected");
  r = await owner.from("scholarships").delete().eq("id", schA.id);
  check(r.error?.code === "23503", "a scholarship used by an application cannot be deleted");
  r = await owner.from("application_scholarships").delete().eq("application_id", a3).eq("scholarship_id", schA.id);
  check(!r.error, "unlink scholarship");

  // ---- deletion behaviour
  await owner.from("application_scholarships").insert({ application_id: a3, scholarship_id: schB.id });
  r = await owner.from("programs").delete().eq("id", prog.id);
  check(r.error?.code === "23503", "a program with applications cannot be deleted");
  r = await owner.from("applications").delete().eq("id", a3);
  check(!r.error, "application deleted");
  const gone = await Promise.all([
    owner.from("application_requirements").select("id", { count: "exact", head: true }).eq("application_id", a3),
    owner.from("application_status_history").select("id", { count: "exact", head: true }).eq("application_id", a3),
    owner.from("application_scholarships").select("scholarship_id", { count: "exact", head: true }).eq("application_id", a3),
  ]);
  check(gone.every((x) => x.count === 0), "deleting an application removes only its own requirements, history and links");
  const kept = await Promise.all([owner.from("programs").select("id").eq("id", prog.id), owner.from("universities").select("id").eq("id", uni.id), owner.from("scholarships").select("id").eq("id", schB.id)]);
  check(kept.every((x) => x.data?.length === 1), "university, program and scholarship survive the application's deletion");

  // ---- owner-only access
  r = await anon.rpc("create_application", { p_data: { program_id: prog.id }, p_requirements: [] });
  check(!!r.error, "anonymous cannot call create_application");
  r = await anon.rpc("change_application_status", { p_id: a1, p_status: "submitted" });
  check(!!r.error, "anonymous cannot call change_application_status");
  for (const t of ["application_overview", "application_requirements", "application_status_history", "applications"]) {
    const x = await anon.from(t).select("*").limit(1);
    check(!!x.error || (x.data ?? []).length === 0, `anonymous cannot read ${t}`);
  }
  if (process.env.SUPABASE_TEST_NON_OWNER_EMAIL && process.env.SUPABASE_TEST_NON_OWNER_PASSWORD) {
    const { error: oe } = await other.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_NON_OWNER_EMAIL, password: process.env.SUPABASE_TEST_NON_OWNER_PASSWORD });
    if (oe) skip("non-owner sign-in unavailable");
    else {
      for (const t of ["application_overview", "application_requirements", "application_status_history", "applications"]) {
        const x = await other.from(t).select("*").limit(5);
        check(!x.error && x.data.length === 0, `non-owner sees no rows in ${t}`);
      }
      const c = await other.rpc("create_application", { p_data: { program_id: prog.id }, p_requirements: [] });
      check(!!c.error, "non-owner cannot create an application");
      const s = await other.rpc("change_application_status", { p_id: a1, p_status: "withdrawn" });
      check(!!s.error && (await owner.from("applications").select("status").eq("id", a1).single()).data.status === "rejected", "non-owner cannot change an owner application's status");
      const u = await other.from("application_requirements").insert({ application_id: a1, title: "hack" });
      check(!!u.error, "non-owner cannot add requirements");
    }
  } else skip("non-owner credentials not configured");
} catch (e) {
  failures++; console.log("FAIL: unexpected error: " + (e.message ?? e));
} finally {
  for (const id of ids.applications) await owner.from("applications").delete().eq("id", id);
  for (const t of ["scholarships", "programs", "universities"]) for (const id of ids[t]) { const { error } = await owner.from(t).delete().eq("id", id); if (error) { failures++; console.log(`FAIL: cleanup ${t} ${id}: ${error.code}`); } }
  const left = await owner.from("universities").select("id", { count: "exact", head: true }).ilike("name", "ZZ-P6-TEST%");
  console.log(`CLEANUP: leftover test universities = ${left.count}`);
}
console.log(`\n${failures ? "FAILED" : "OK"}: ${failures} failure(s), ${skipped} skipped`);
process.exit(failures ? 1 : 0);
