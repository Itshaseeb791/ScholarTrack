// Phase 7 live data-layer checks (needs migration 20261115000100 applied). Every record is prefixed "ZZ-P7-TEST"
// and removed in finally. The SELECT strings used by the app are read from the source file, so this test cannot drift.
import { readFileSync } from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_TEST_OWNER_EMAIL: email, SUPABASE_TEST_OWNER_PASSWORD: pw } = process.env;
if (!url || !key || !email || !pw) { console.error("BLOCKED: missing Supabase test environment entries"); process.exit(1); }
const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = mk(), anon = mk(), other = mk();
const TAG = "ZZ-P7-TEST " + Date.now();
const made = { tasks: [], events: [], reminders: [], applications: [], scholarships: [], programs: [], universities: [] };
let failures = 0, skipped = 0;
const check = (cond, msg) => { if (cond) console.log("PASS: " + msg); else { failures++; console.log("FAIL: " + msg); } };
const skip = (msg) => { skipped++; console.log("SKIP: " + msg); };
const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const src = readFileSync(new URL("../src/lib/records/planning-queries.ts", import.meta.url), "utf8");
const sel = (name) => { const m = src.match(new RegExp(`const ${name} = "([^"]+)"`)); if (!m) throw new Error("missing constant " + name); return m[1]; };
const ins = async (table, row) => { const r = await owner.from(table).insert(row).select().single(); if (r.data?.id) made[table].push(r.data.id); return r; };
const code = (r) => r.error?.code;
const zero = "00000000-0000-4000-8000-000000000000";

try {
  const { error: le } = await owner.auth.signInWithPassword({ email, password: pw });
  check(!le, "owner sign-in");
  const probe = await owner.from("reminders").select("offset_days").limit(0);
  if (probe.error) { console.log("BLOCKED: Phase 7 migration is not applied (" + probe.error.code + ")"); process.exit(2); }

  // ---- fixtures
  const uni = (await ins("universities", { name: TAG + " Uni", country: "Testland" })).data;
  const prog = (await ins("programs", { university_id: uni.id, name: TAG + " MSc", application_deadline: D(40) })).data;
  const sch = (await ins("scholarships", { name: TAG + " Sch", application_deadline: D(7), country: "Testland" })).data;
  const appId = (await owner.rpc("create_application", { p_data: { program_id: prog.id, application_deadline: D(12) }, p_requirements: [] })).data; made.applications.push(appId);
  const reqRow = (await owner.from("application_requirements").insert({ application_id: appId, title: TAG + " SOP", due_date: D(5) }).select().single()).data;

  // ---- tasks
  let r = await ins("tasks", { title: TAG + " Task", description: "d", priority: "urgent", status: "todo", due_date: D(3), due_time: "14:30" });
  check(!r.error && r.data.priority === "urgent" && r.data.due_time.startsWith("14:30") && r.data.completed_at === null && r.data.user_id === process.env.SUPABASE_OWNER_ID, "task created (urgent priority, due time, owner)");
  const task = r.data;
  check(code(await owner.from("tasks").insert({ title: TAG + " bad", priority: "critical" })) === "23514", "unknown priority rejected");
  check(code(await owner.from("tasks").insert({ title: TAG + " bad", due_time: "10:00" })) === "23514", "due time without a due date rejected");
  check(code(await owner.from("tasks").insert({ title: TAG + " bad", description: "x".repeat(5001) })) === "23514", "over-long description rejected");
  check(code(await owner.from("tasks").insert({ title: "  " })) === "23514", "blank title rejected");
  check(code(await owner.from("tasks").insert({ title: TAG + " bad", status: "done" })) === "23514", "unknown status rejected");
  for (const old of ["low", "medium", "high"]) { const x = await ins("tasks", { title: TAG + " " + old, priority: old }); check(!x.error, `existing priority '${old}' still valid`); }
  r = await owner.from("tasks").update({ status: "completed" }).eq("id", task.id).select().single();
  check(r.data?.status === "completed" && !!r.data.completed_at, "completing a task stamps completed_at");
  const stamp = r.data.completed_at;
  await owner.from("tasks").update({ title: TAG + " Task renamed" }).eq("id", task.id);
  check((await owner.from("tasks").select("completed_at").eq("id", task.id).single()).data.completed_at === stamp, "other edits keep the completion time");
  r = await owner.from("tasks").update({ status: "todo" }).eq("id", task.id).select().single();
  check(r.data?.completed_at === null, "reopening clears completed_at");
  const done = await ins("tasks", { title: TAG + " born done", status: "completed" });
  check(!!done.data?.completed_at, "a task created as completed gets completed_at");

  // ---- task <-> application
  check(code(await owner.from("tasks").update({ application_id: zero }).eq("id", task.id)) === "23503", "linking a task to a non-existent application rejected");
  r = await owner.from("tasks").update({ application_id: appId }).eq("id", task.id).select().single();
  check(!r.error && r.data.application_id === appId, "task linked to an application");
  r = await owner.from("applications").delete().eq("id", appId);
  check(code(r) === "23503", "an application with a task cannot be deleted");
  r = await owner.from("tasks").update({ application_id: null }).eq("id", task.id).select().single();
  check(!r.error && r.data.application_id === null, "task unlinked from the application");
  await owner.from("tasks").update({ application_id: appId }).eq("id", task.id);

  // ---- events
  r = await ins("events", { title: TAG + " Interview", event_type: "interview", starts_at: new Date(Date.now() + 2 * 86400000).toISOString(), ends_at: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(), location: "Zoom", meeting_url: "https://meet.example.com/x", application_id: appId });
  check(!r.error && r.data.all_day === false && r.data.start_date === null, "timed event created and linked to an application");
  const timed = r.data;
  r = await ins("events", { title: TAG + " Webinar", event_type: "webinar", all_day: true, start_date: D(10), end_date: D(11) });
  check(!r.error && r.data.starts_at === null && r.data.start_date === D(10), "all-day event stored with date-only columns (no timestamp)");
  const allDay = r.data;
  check(code(await owner.from("events").insert({ title: TAG + " bad", all_day: true, start_date: D(1), starts_at: new Date().toISOString() })) === "23514", "all-day event with a timestamp rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", all_day: false })) === "23514", "timed event without a start rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", all_day: true })) === "23514", "all-day event without a start date rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", starts_at: new Date(Date.now() + 5e6).toISOString(), ends_at: new Date().toISOString() })) === "23514", "end before start rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", all_day: true, start_date: D(5), end_date: D(4) })) === "23514", "all-day end date before start rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", starts_at: new Date().toISOString(), meeting_url: "javascript:alert(1)" })) === "23514", "non-http meeting link rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", starts_at: new Date().toISOString(), event_type: "party" })) === "23514", "unknown event category rejected");
  check(code(await owner.from("events").insert({ title: TAG + " bad", starts_at: new Date().toISOString(), application_id: zero })) === "23503", "event linked to a non-existent application rejected");
  r = await owner.from("events").update({ application_id: null }).eq("id", timed.id).select().single();
  check(!r.error && r.data.application_id === null, "event unlinked from the application");
  await owner.from("events").update({ application_id: appId }).eq("id", timed.id);

  // ---- calendar aggregation queries, exactly as the app builds them
  const from = D(0), to = D(14), a = new Date(from + "T00:00:00Z").toISOString(), b = new Date(D(15) + "T00:00:00Z").toISOString();
  const [pr, sc, ap, rq, tk, evT, evA] = await Promise.all([
    owner.from("programs").select(sel("PROGRAM_SELECT")).gte("application_deadline", D(35)).lte("application_deadline", D(45)),
    owner.from("scholarships").select("id,name,provider,country,application_deadline").gte("application_deadline", from).lte("application_deadline", to),
    owner.from("application_overview").select("id,program_id,status,effective_deadline,university_name,university_country,program_name").in("status", ["researching", "preparing", "ready_to_apply"]).gte("effective_deadline", from).lte("effective_deadline", to),
    owner.from("application_requirements").select(sel("REQ_SELECT")).gte("due_date", from).lte("due_date", to),
    owner.from("tasks").select(sel("TASK_SELECT")).gte("due_date", from).lte("due_date", to),
    owner.from("events").select(sel("EVENT_SELECT")).eq("all_day", false).lt("starts_at", b).or(`ends_at.gte.${a},and(ends_at.is.null,starts_at.gte.${a})`),
    owner.from("events").select(sel("EVENT_SELECT")).eq("all_day", true).lte("start_date", to).or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`),
  ]);
  for (const [n, x] of Object.entries({ pr, sc, ap, rq, tk, evT, evA })) check(!x.error, `calendar query works: ${n}${x.error ? " (" + x.error.code + " " + x.error.message + ")" : ""}`);
  check(pr.data.some((p) => p.id === prog.id) && !!pr.data[0].universities, "program deadline in range, with its university embedded");
  check(sc.data.some((s) => s.id === sch.id), "scholarship deadline appears in range");
  check(ap.data.some((x) => x.id === appId && x.effective_deadline === D(12)), "application deadline (override) appears in range");
  check(rq.data.some((x) => x.id === reqRow.id && x.applications?.status === "researching"), "requirement due date appears with its application status");
  check(tk.data.some((x) => x.id === task.id) && tk.data.find((x) => x.id === task.id).applications, "task appears with its application label");
  check(evT.data.some((x) => x.id === timed.id) && !evT.data.some((x) => x.id === allDay.id), "timed event found by the overlap query");
  check(evA.data.some((x) => x.id === allDay.id), "all-day event found by the overlap query");
  const far = await owner.from("events").select("id").eq("all_day", true).lte("start_date", D(100)).or(`end_date.gte.${D(90)},and(end_date.is.null,start_date.gte.${D(90)})`);
  check(!far.error && !far.data.some((x) => x.id === allDay.id), "events outside the range are not returned");
  const spanning = await owner.from("events").select("id").eq("all_day", true).lte("start_date", D(11)).or(`end_date.gte.${D(11)},and(end_date.is.null,start_date.gte.${D(11)})`);
  check(spanning.data.some((x) => x.id === allDay.id), "a multi-day event is found on its last day");

  // ---- reminders: one validated source each
  const sources = [["task_id", task.id], ["event_id", timed.id], ["application_id", appId], ["scholarship_id", sch.id], ["program_id", prog.id], ["requirement_id", reqRow.id]];
  const remIds = {};
  for (const [col, id] of sources) {
    r = await ins("reminders", { [col]: id, offset_days: 3 });
    check(!r.error && r.data.enabled === true && r.data.acknowledged_at === null, `offset reminder created for ${col}`);
    remIds[col] = r.data?.id;
  }
  check(code(await owner.from("reminders").insert({ offset_days: 1 })) === "23514", "reminder without a source rejected");
  check(code(await owner.from("reminders").insert({ task_id: task.id, event_id: timed.id, offset_days: 1 })) === "23514", "reminder with two sources rejected");
  check(code(await owner.from("reminders").insert({ task_id: task.id, offset_days: 1, remind_at: new Date().toISOString() })) === "23514", "reminder with both an offset and a custom time rejected");
  check(code(await owner.from("reminders").insert({ task_id: task.id })) === "23514", "reminder without any schedule rejected");
  check(code(await owner.from("reminders").insert({ task_id: task.id, offset_days: 400 })) === "23514", "absurd offset rejected");
  check(code(await owner.from("reminders").insert({ task_id: zero, offset_days: 1 })) === "23503", "reminder for a non-existent task rejected (FK)");
  check(code(await owner.from("reminders").insert({ scholarship_id: zero, offset_days: 1 })) === "23503", "reminder for a non-existent scholarship rejected (FK)");
  check(code(await owner.from("reminders").insert({ task_id: task.id, offset_days: 3 })) === "23505", "duplicate offset on the same source rejected (idempotent)");
  r = await ins("reminders", { task_id: task.id, offset_days: 7 });
  check(!r.error, "a different offset on the same source is allowed");
  const at = new Date(Date.now() + 86400000).toISOString();
  r = await ins("reminders", { task_id: task.id, remind_at: at });
  check(!r.error && r.data.offset_days === null, "custom-time reminder created");
  check(code(await owner.from("reminders").insert({ task_id: task.id, remind_at: at })) === "23505", "duplicate custom time rejected");

  // ---- reminder state, embed query, cascades
  const e = await owner.from("reminders").select(sel("REMINDER_SELECT")).in("id", Object.values(remIds));
  check(!e.error, "reminder embed query works" + (e.error ? ` (${e.error.code} ${e.error.message})` : ""));
  const byCol = (c) => e.data?.find((x) => x[c]);
  check(byCol("task_id")?.tasks?.title === TAG + " Task renamed" && byCol("event_id")?.events?.title === TAG + " Interview"
    && byCol("application_id")?.applications?.programs?.name === TAG + " MSc" && byCol("scholarship_id")?.scholarships?.name === TAG + " Sch"
    && byCol("program_id")?.programs?.name === TAG + " MSc" && byCol("requirement_id")?.application_requirements?.title === TAG + " SOP", "every source type resolves through the embed (no ambiguity)");
  const now = new Date().toISOString();
  r = await owner.from("reminders").update({ acknowledged_at: now }).eq("id", remIds.task_id).select().single();
  check(r.data?.acknowledged_at && r.data.delivered_at === null && r.data.status === "pending", "acknowledging sets acknowledged_at only (delivered_at untouched)");
  r = await owner.from("reminders").update({ dismissed_at: now, acknowledged_at: null }).eq("id", remIds.task_id).select().single();
  check(r.data?.dismissed_at && r.data.acknowledged_at === null, "dismissing a reminder");
  r = await owner.from("reminders").update({ dismissed_at: null, enabled: false }).eq("id", remIds.task_id).select().single();
  check(r.data?.dismissed_at === null && r.data.enabled === false, "restoring and disabling a reminder");
  await owner.from("reminders").update({ enabled: true }).eq("id", remIds.task_id);
  const count = async (col, id) => (await owner.from("reminders").select("id", { count: "exact", head: true }).eq(col, id)).count;
  r = await owner.from("tasks").delete().eq("id", task.id);
  check(!r.error && (await count("task_id", task.id)) === 0 && (await owner.from("applications").select("id").eq("id", appId)).data.length === 1, "deleting a task removes its reminders and leaves the application");
  r = await owner.from("events").delete().eq("id", timed.id);
  check(!r.error && (await count("event_id", timed.id)) === 0, "deleting an event removes its reminders");
  r = await owner.from("application_requirements").delete().eq("id", reqRow.id);
  check(!r.error && (await count("requirement_id", reqRow.id)) === 0, "deleting a requirement removes its reminders");
  r = await owner.from("scholarships").delete().eq("id", sch.id);
  check(!r.error && (await count("scholarship_id", sch.id)) === 0, "deleting a scholarship removes its reminders");
  r = await owner.from("applications").delete().eq("id", appId);
  check(!r.error && (await count("application_id", appId)) === 0, "deleting an application (no tasks/events left) removes its reminders");
  r = await owner.from("programs").delete().eq("id", prog.id);
  check(!r.error && (await count("program_id", prog.id)) === 0, "deleting a program removes its reminders");

  // ---- owner-only access
  for (const t of ["tasks", "events", "reminders"]) {
    const x = await anon.from(t).select("*").limit(1);
    check(!!x.error || (x.data ?? []).length === 0, `anonymous cannot read ${t}`);
  }
  check(!!(await anon.from("tasks").insert({ title: "x" })).error, "anonymous cannot insert a task");
  if (process.env.SUPABASE_TEST_NON_OWNER_EMAIL && process.env.SUPABASE_TEST_NON_OWNER_PASSWORD) {
    const { error: oe } = await other.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_NON_OWNER_EMAIL, password: process.env.SUPABASE_TEST_NON_OWNER_PASSWORD });
    if (oe) skip("non-owner sign-in unavailable");
    else {
      for (const t of ["tasks", "events", "reminders"]) { const x = await other.from(t).select("*").limit(5); check(!x.error && x.data.length === 0, `non-owner sees no rows in ${t}`); }
      check(code(await other.from("tasks").insert({ title: "x" })) === "42501", "non-owner task insert denied by RLS");
      check(code(await other.from("events").insert({ title: "x", starts_at: new Date().toISOString() })) === "42501", "non-owner event insert denied by RLS");
      // Use a surviving owner task so a missing foreign key cannot make this test pass for the wrong reason.
      check(code(await other.from("reminders").insert({ task_id: done.data.id, offset_days: 1 })) === "42501", "non-owner reminder insert with an existing source denied by RLS");
    }
  } else skip("non-owner credentials not configured");
} catch (e) {
  failures++; console.log("FAIL: unexpected error: " + (e.message ?? e));
} finally {
  for (const id of made.reminders) await owner.from("reminders").delete().eq("id", id);
  for (const t of ["tasks", "events"]) for (const id of made[t]) await owner.from(t).delete().eq("id", id);
  for (const id of made.applications) await owner.from("applications").delete().eq("id", id);
  for (const t of ["scholarships", "programs", "universities"]) for (const id of made[t]) await owner.from(t).delete().eq("id", id);
  // sweep by name too, in case an id was never recorded
  await owner.from("tasks").delete().ilike("title", "ZZ-P7-TEST%"); await owner.from("events").delete().ilike("title", "ZZ-P7-TEST%");
  const left = await Promise.all([["tasks", "title"], ["events", "title"], ["universities", "name"], ["scholarships", "name"]].map(async ([t, c]) => (await owner.from(t).select("id", { count: "exact", head: true }).ilike(c, "ZZ-P7-TEST%")).count));
  console.log(`CLEANUP: leftover tasks/events/universities/scholarships = ${left.join("/")}`);
  if (left.some((n) => n)) failures++;
}
console.log(`\n${failures ? "FAILED" : "OK"}: ${failures} failure(s), ${skipped} skipped`);
process.exit(failures ? 1 : 0);
