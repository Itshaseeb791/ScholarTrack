// Dashboard checks: pure-logic unit tests, then a live test that inserts temporary
// rows (fresh UUIDs, removed in finally) and compares dashboard output to a baseline delta.
import assert from "node:assert"; // loose deepEqual: vm-loaded objects have another realm's prototypes
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const src = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, process, Intl, Date, require: (n) => mocks[n] ?? (n === "server-only" ? {} : require(n)) }, { filename: file });
  return exports;
}
const time = load("lib/time.ts");
const logic = load("lib/dashboard-logic.ts", { "./time": time });
const today = "2026-11-13";

test("deadlines merge all sources, sort ascending, keep overdue tasks only", () => {
  const d = logic.buildDeadlines({
    programs: [{ id: "1", name: "P late", application_deadline: "2026-12-01" }, { id: "2", name: "P past", application_deadline: "2026-11-01" }, { id: "x", name: "none", application_deadline: null }],
    scholarships: [{ id: "3", name: "S", application_deadline: "2026-11-14" }],
    tasks: [{ id: "4", title: "T overdue", due_date: "2026-11-10", status: "todo" }, { id: "5", title: "T done", due_date: "2026-11-20", status: "completed" }],
    events: [{ id: "6", title: "E", starts_at: "2026-11-13T09:00:00Z" }],
  }, today);
  assert.deepEqual(d.map((x) => x.title), ["T overdue", "E", "S", "P late"]);
  assert.deepEqual(d.map((x) => x.source), ["Task", "Event", "Scholarship", "Program"]);
});

test("countdown labels and urgency", () => {
  assert.equal(logic.remaining(-2), "2 days overdue");
  assert.equal(logic.remaining(0), "Today");
  assert.equal(logic.remaining(1), "Tomorrow");
  assert.equal(logic.daysUntil("2026-11-16", today), 3);
  assert.deepEqual([-1, 0, 3, 4].map(logic.urgency), ["overdue", "urgent", "urgent", "normal"]);
});

test("stats count statuses and 30-day window", () => {
  const dl = [{ date: "2026-11-13" }, { date: "2026-12-13" }, { date: "2026-12-14" }, { date: "2026-11-01" }];
  const s = logic.buildStats(["researching", "preparing", "submitted", "accepted", "withdrawn"], 2, 3, dl, today);
  assert.deepEqual(s, { universities: 2, scholarships: 3, applications: 5, inProgress: 2, submitted: 2, upcoming: 2 });
});

test("task groups", () => {
  const g = logic.groupTasks([
    { id: "a", status: "todo", due_date: "2026-11-12", priority: "low" }, { id: "b", status: "in_progress", due_date: today, priority: "high" },
    { id: "c", status: "completed", due_date: "2026-11-01", priority: "high" }, { id: "d", status: "todo", due_date: null, priority: "medium" },
  ], today);
  assert.deepEqual([g.overdue.map((t) => t.id), g.today.map((t) => t.id), g.high.map((t) => t.id)], [["a"], ["b"], ["b"]]);
});

test("timezone: UTC instants map to the Asia/Karachi calendar day at midnight boundaries", () => {
  const day = (iso) => time.todayIn("Asia/Karachi", new Date(iso));
  assert.equal(day("2026-11-12T18:59:59Z"), "2026-11-12"); // 23:59:59 in Karachi
  assert.equal(day("2026-11-12T19:00:00Z"), "2026-11-13"); // 00:00:00 in Karachi
  assert.equal(day("2026-11-13T00:30:00Z"), "2026-11-13");
  assert.equal(time.todayIn("UTC", new Date("2026-11-12T19:00:00Z")), "2026-11-12"); // same instant, other zone
  assert.equal(time.todayIn("Pacific/Kiritimati", new Date("2026-11-12T10:30:00Z")), "2026-11-13"); // UTC+14
});

test("timezone: date-only values never shift, timestamps become the local day", () => {
  assert.equal(time.formatDateOnly("2026-11-13", { day: "numeric", month: "short", year: "numeric" }), "13 Nov 2026");
  assert.equal(time.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(time.daysBetween("2026-11-13", "2026-11-14"), 1);
  assert.equal(time.daysBetween("2026-03-28", "2026-03-30"), 2); // no DST drift
  // An event at 01:00 Karachi on the 13th is stored as the 12th 20:00 UTC: it belongs to the 13th.
  const d = logic.buildDeadlines({ programs: [], scholarships: [], tasks: [], events: [{ id: "e", title: "Late", starts_at: "2026-11-12T20:00:00Z" }] }, "2026-11-13", "Asia/Karachi");
  assert.deepEqual(d.map((x) => x.date), ["2026-11-13"]);
  // ...and an event just before local midnight on the 12th is already in the past on the 13th.
  const past = logic.buildDeadlines({ programs: [], scholarships: [], tasks: [], events: [{ id: "e", title: "Early", starts_at: "2026-11-12T18:59:00Z" }] }, "2026-11-13", "Asia/Karachi");
  assert.equal(past.length, 0);
});

test("timezone: invalid APP_TIMEZONE falls back to Asia/Karachi", () => {
  const previous = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = "Not/AZone";
  assert.equal(time.getTimezone(), "Asia/Karachi");
  if (previous === undefined) delete process.env.APP_TIMEZONE; else process.env.APP_TIMEZONE = previous;
});

nextEnv.loadEnvConfig(process.cwd());
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_TEST_OWNER_EMAIL: email, SUPABASE_TEST_OWNER_PASSWORD: password } = process.env;
test("live dashboard loader reflects temporary rows", { skip: !(url && key && email && password) && "no owner test credentials" }, async () => {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok(!(await db.auth.signInWithPassword({ email, password })).error);
  const { loadDashboard } = load("lib/dashboard.ts", { "./dashboard-logic": logic, "./time": time });
  const created = []; // [table, id] in insertion order
  const add = async (table, row) => {
    const r = await db.from(table).insert(row).select("id").single();
    assert.ok(!r.error, `${table}: ${r.error?.code}`);
    created.push([table, r.data.id]); return r.data.id;
  };
  try {
    const before = await loadDashboard(db);
    const day = (n) => time.addDays(time.todayIn(time.getTimezone()), n); // same zone as the dashboard
    const uni = await add("universities", { name: "ZZ Dashboard Test University", country: "Testland" });
    const prog = await db.from("programs").insert({ university_id: uni, name: "ZZ Test MSc", application_deadline: day(2) }).select("id").single();
    assert.ok(!prog.error, "program " + prog.error?.code); created.push(["programs", prog.data.id]);
    const sch = await add("scholarships", { name: "ZZ Test Scholarship", application_deadline: day(5) });
    const app = await add("applications", { program_id: prog.data.id, status: "preparing" });
    const link = await db.from("application_scholarships").insert({ application_id: app, scholarship_id: sch });
    assert.ok(!link.error, "link " + link.error?.code); created.push(["application_scholarships", null, { application_id: app, scholarship_id: sch }]);
    await add("tasks", { title: "ZZ overdue", due_date: day(-1), priority: "high" });
    await add("tasks", { title: "ZZ today", due_date: day(0) });
    const after = await loadDashboard(db);
    const d = (k) => after.stats[k] - before.stats[k];
    assert.deepEqual([d("universities"), d("scholarships"), d("applications"), d("inProgress"), d("submitted")], [1, 1, 1, 1, 0]);
    assert.equal(d("upcoming"), 3); // program, scholarship, today task; the overdue task is not "upcoming"
    assert.equal(after.recent[0].programs.universities.name, "ZZ Dashboard Test University");
    assert.equal(after.recent[0].application_scholarships[0].scholarships.name, "ZZ Test Scholarship");
    const titles = after.deadlines.map((x) => x.title);
    assert.ok(titles.indexOf("ZZ overdue") < titles.indexOf("ZZ Test MSc") && titles.indexOf("ZZ Test MSc") < titles.indexOf("ZZ Test Scholarship"));
    assert.equal(after.tasks.overdue.length - before.tasks.overdue.length, 1);
    assert.equal(after.tasks.today.length - before.tasks.today.length, 1);
  } finally {
    for (const [table, id, match] of created.reverse()) {
      const q = db.from(table).delete();
      const r = await (id ? q.eq("id", id) : q.match(match));
      if (r.error) console.error("CLEANUP FAILED:", table, r.error.code);
    }
    await db.auth.signOut({ scope: "local" });
  }
});
