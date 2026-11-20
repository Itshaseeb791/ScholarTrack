// Phase 7 browser checks (production server on :3100, owner test credentials, Phase 7 migration applied).
// Fixtures are created through the owner API as "ZZ-P7-UI ..." and swept in finally.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { launch, origin } from "./lib/cdp.mjs";

nextEnv.loadEnvConfig(process.cwd());
const TAG = "ZZ-P7-UI " + Date.now().toString().slice(-6);
const karachiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const D = (n) => new Date(Date.parse(karachiToday) + n * 86400000).toISOString().slice(0, 10);
const T = karachiToday;
const ok = (m) => console.log("PASS: " + m);

const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: loginError } = await api.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_OWNER_EMAIL, password: process.env.SUPABASE_TEST_OWNER_PASSWORD });
assert(!loginError, "owner API sign-in");
assert(!(await api.from("reminders").select("offset_days").limit(0)).error, "Phase 7 migration must be applied");

const b = await launch();
const { send, evaluate, until, delay } = b;
let s;
const go = async (path) => {
  await send("Page.navigate", { url: origin + path }, s);
  await until(() => evaluate(s, `location.pathname === ${JSON.stringify(path.split("?")[0])} && !!document.querySelector('#main h1')`), "navigate " + path);
};
const text = () => evaluate(s, "document.querySelector('#main').innerText");
const waitText = (t, label) => until(async () => (await text()).includes(t), label ?? t);
const hydrated = (sel = "#main form") => until(() => evaluate(s, `Object.keys(document.querySelector(${JSON.stringify(sel)}) ?? {}).some((k) => k.startsWith('__reactProps'))`), "hydrated " + sel);
const fill = (values, scope = "document") => evaluate(s, `(() => { const root = ${scope}; const v = ${JSON.stringify(values)};
  for (const [n, val] of Object.entries(v)) { const el = root.querySelector('[name=' + n + ']');
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
const click = (sel) => evaluate(s, `document.querySelector(${JSON.stringify(sel)}).click()`);
const clickText = (sel, t) => evaluate(s, `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(t)}))?.click()`);
const submit = () => click("#main form button[type=submit]");
const onDetail = (seg) => until(() => evaluate(s, "/^\\/" + seg.replace("/", "\\/") + "\\/[0-9a-f-]{36}$/.test(location.pathname)"), "detail " + seg).catch(async (e) => {
  throw new Error(e.message + " | now at " + (await evaluate(s, "location.pathname")) + " | " + (await text()).replace(/\s+/g, " ").slice(0, 400));
});
const noOverflow = async (label) => { const w = await evaluate(s, "[document.documentElement.scrollWidth, window.innerWidth]"); assert(w[0] <= w[1], `${label}: overflow ${w[0]} > ${w[1]}`); };
const phone = () => send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
const desktop = () => send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
const dialogOpen = () => until(() => evaluate(s, "!!document.querySelector('[role=dialog]')"), "dialog");
const bell = () => evaluate(s, "Number(document.querySelector('[data-reminder-count]')?.getAttribute('data-reminder-count') ?? -1)");
const bellIs = (n, label) => until(async () => (await bell()) === n, label ?? "bell " + n);
const cell = (d) => evaluate(s, `document.querySelector('[data-day="${d}"]')?.getAttribute('aria-label') ?? null`);
const dayItems = () => evaluate(s, "[...document.querySelectorAll('[data-day-list] ul li a')].map((a) => a.innerText.replace(/\\s+/g, ' ').trim())");

try {
  // ---------- fixtures (API) ----------
  const uni = (await api.from("universities").insert({ name: TAG + " Uni", country: "Testland" }).select().single()).data;
  const prog = (await api.from("programs").insert({ university_id: uni.id, name: TAG + " MSc", application_deadline: D(40) }).select().single()).data;
  await api.from("programs").insert({ university_id: uni.id, name: TAG + " Solo", application_deadline: D(20) });
  const sch = (await api.from("scholarships").insert({ name: TAG + " Sch", application_deadline: D(6), country: "Testland" }).select().single()).data;
  const appId = (await api.rpc("create_application", { p_data: { program_id: prog.id, application_deadline: D(9), intake: "Fall" }, p_requirements: [] })).data;
  await api.from("application_requirements").insert({ application_id: appId, title: TAG + " SOP", due_date: D(4) });
  const overdue = (await api.from("tasks").insert({ title: TAG + " Overdue task", due_date: D(-3), priority: "high" }).select().single()).data;
  await api.from("tasks").insert({ title: TAG + " Undated task" });

  s = await b.tab();
  await phone();
  await b.loginOwner(s);
  ok("owner login (390px)");

  // ---------- tasks: validation + create ----------
  await go("/tasks?q=" + encodeURIComponent("zz-nothing-" + Date.now()));
  assert((await text()).includes("No tasks match your search"));
  await go("/tasks/new"); await hydrated();
  await click("#main form button[type=submit]");
  await waitText("is required");
  ok("task form: required title error");
  await fill({ title: TAG + " Today task", priority: "urgent", due_date: T, due_time: "23:30" });
  await submit(); await onDetail("tasks");
  const taskPath = await evaluate(s, "location.pathname"), taskId = taskPath.split("/").pop();
  let t = await text();
  assert(t.includes(TAG + " Today task") && /urgent/i.test(t) && /due today/i.test(t) && t.includes("23:30"), "created task detail: " + t);
  ok("task created: urgent priority, due today at 23:30 (still 'today', not overdue)");
  await go("/");
  const dashboardGroup = (title) => evaluate(s, `Array.from(document.querySelectorAll('#main h3')).find((e) => e.textContent.startsWith(${JSON.stringify(title)}))?.parentElement.innerText ?? ''`);
  assert((await dashboardGroup("Due today")).includes(TAG + " Today task"), "new task appears on the dashboard");
  assert((await dashboardGroup("High priority")).includes(TAG + " Today task"), "urgent task appears among high-priority tasks");
  const todayCount = await evaluate(s, `document.querySelector('ul[aria-label="Next 7 days"] a[href="/calendar?view=day&date=${T}"]').getAttribute('aria-label')`);
  assert(/, [1-9]\d* items?$/.test(todayCount), "This week counts the new task");
  ok("dashboard updates after task creation, including urgent priority and This week count");
  await go("/tasks/new"); await hydrated();
  await fill({ title: TAG + " bad time", due_time: "10:00" });
  await submit(); await waitText("Set a due date");
  ok("due time without a due date is rejected");

  // ---------- create from an application and from a calendar date ----------
  await go("/applications/" + appId);
  await clickText("#main a", "Add task");
  await until(() => evaluate(s, "location.pathname === '/tasks/new' && !!document.querySelector('[name=application_id]')"), "new task form from app"); await hydrated();
  assert.equal(await evaluate(s, "document.querySelector('[name=application_id]').value"), appId);
  await fill({ title: TAG + " App task", due_date: D(2) });
  await submit(); await onDetail("tasks");
  assert((await text()).includes(TAG + " Uni"));
  await go("/applications/" + appId);
  assert((await text()).includes(TAG + " App task"));
  ok("task created from an application workspace (application preselected) and listed there");
  await go(`/calendar?view=day&date=${D(5)}`);
  await clickText("#main a", "Add task");
  await until(() => evaluate(s, "location.pathname === '/tasks/new' && !!document.querySelector('[name=application_id]')"), "new task form from calendar"); await hydrated();
  assert.equal(await evaluate(s, "document.querySelector('[name=due_date]').value"), D(5));
  ok("task created from a calendar date preselects that date");

  // ---------- task list: views, filters, completion ----------
  await go("/tasks?view=overdue");
  t = await text();
  assert(t.includes(TAG + " Overdue task") && !t.includes(TAG + " Today task"));
  await go("/tasks?view=today");
  assert((await text()).includes(TAG + " Today task") && !(await text()).includes(TAG + " Overdue task"));
  await go("/tasks?view=upcoming");
  assert((await text()).includes(TAG + " App task"));
  await go("/tasks?q=" + encodeURIComponent(TAG.toLowerCase()) + "&priority=high");
  t = await text();
  assert(t.includes(TAG + " Overdue task") && !t.includes(TAG + " Today task"));
  await go("/tasks?application=" + appId);
  assert((await text()).includes(TAG + " App task") && !(await text()).includes(TAG + " Overdue task"));
  await go("/tasks?q=%25_%2C()&sort=evil");
  assert(!(await text()).includes("Something went wrong"));
  ok("task views (today / overdue / upcoming), search, priority + application filters, hostile input");
  const tabCount = (name) => evaluate(s, `Number([...document.querySelectorAll('nav[aria-label="Task views"] a')].find((a) => a.textContent.includes(${JSON.stringify(name)})).querySelector('span').textContent)`);
  await go("/tasks?view=overdue");
  const overdueCount = await tabCount("Overdue");
  await click("li:has(a[href=\"/tasks/" + overdue.id + "\"]) button[role=checkbox]");
  await until(async () => (await api.from("tasks").select("status").eq("id", overdue.id).single()).data?.status === "completed", "task completed in db");
  assert(!!(await api.from("tasks").select("completed_at").eq("id", overdue.id).single()).data.completed_at);
  await go("/tasks?view=overdue");
  assert(!(await text()).includes(TAG + " Overdue task"), "completed task leaves the overdue list");
  assert.equal(await tabCount("Overdue"), overdueCount - 1);
  await go("/");
  assert(!(await dashboardGroup("Overdue")).includes(TAG + " Overdue task"), "completed task leaves the dashboard overdue group");
  await go("/tasks?view=completed");
  assert((await text()).includes(TAG + " Overdue task"));
  await click("li:has(a[href=\"/tasks/" + overdue.id + "\"]) button[role=checkbox]");
  await until(async () => (await api.from("tasks").select("status").eq("id", overdue.id).single()).data?.status === "todo", "reopened");
  assert.equal((await api.from("tasks").select("completed_at").eq("id", overdue.id).single()).data.completed_at, null);
  await go("/");
  assert((await dashboardGroup("Overdue")).includes(TAG + " Overdue task"), "reopened task returns to the dashboard overdue group");
  ok("one-tap completion stamps completed_at and leaves the overdue count; reopening clears it");
  await noOverflow("tasks 390");

  // ---------- edit + status ----------
  await go(taskPath + "/edit"); await hydrated();
  await fill({ priority: "low", due_date: D(1), due_time: "09:15", title: TAG + " Today task (edited)" });
  await submit(); await onDetail("tasks");
  assert((await text()).includes("edited") && (await text()).includes("09:15"));
  await fill({ status: "in_progress" }, "document.querySelector('form[aria-label=\"Change status\"]')");
  await click("form[aria-label='Change status'] button[type=submit]");
  await until(async () => (await api.from("tasks").select("status").eq("id", taskId).single()).data?.status === "in_progress", "status saved");
  ok("task edited (priority, date, time) and status changed from the detail page");

  // ---------- events ----------
  await go("/calendar/events/new"); await hydrated();
  await fill({ title: TAG + " Interview" });
  await submit(); await waitText("Start date is required");
  await fill({ start_date: D(1) });
  await submit(); await waitText("Start time is required");
  await fill({ start_time: "10:00", end_time: "09:00" });
  await submit(); await waitText("must not be before the start");
  await fill({ end_time: "11:00", event_type: "interview", location: "Zoom", meeting_url: "meet.example.com/abc", application_id: appId });
  await submit(); await onDetail("calendar/events");
  const evPath = await evaluate(s, "location.pathname"), evId = evPath.split("/").pop();
  t = await text();
  assert(t.includes("10:00–11:00") && t.includes("Zoom") && t.includes(TAG + " Uni"));
  const link = await evaluate(s, "[...document.querySelectorAll('#main dl a')].map((a) => [a.href, a.target, a.rel])");
  assert(link.some((l) => l[0].startsWith("https://meet.example.com") && l[1] === "_blank" && l[2] === "noopener noreferrer"));
  const dbEv = (await api.from("events").select("starts_at,ends_at,all_day").eq("id", evId).single()).data;
  assert.equal(new Date(dbEv.starts_at).toISOString(), D(1) + "T05:00:00.000Z", "10:00 Karachi is stored as 05:00 UTC");
  ok("timed event: validation, Karachi wall-clock stored as the right UTC instant, safe meeting link, application link");
  await go("/calendar/events/new"); await hydrated();
  await fill({ title: TAG + " Conference", start_date: D(3), end_date: D(5) });
  await click("[name=all_day]");
  await submit(); await onDetail("calendar/events");
  const adPath = await evaluate(s, "location.pathname");
  assert(/all day/i.test(await text()));
  const dbAd = (await api.from("events").select("starts_at,start_date,end_date,all_day").eq("id", adPath.split("/").pop()).single()).data;
  assert.deepEqual([dbAd.starts_at, dbAd.start_date, dbAd.end_date, dbAd.all_day], [null, D(3), D(5), true]);
  ok("all-day multi-day event stored as date-only columns (no timestamp)");
  await go(evPath + "/edit"); await hydrated();
  await fill({ title: TAG + " Interview (moved)", start_time: "15:00", end_time: "16:30", application_id: "" });
  await submit(); await onDetail("calendar/events");
  assert((await text()).includes("moved") && (await text()).includes("15:00–16:30") && !(await text()).includes(TAG + " Uni"));
  assert.equal((await api.from("events").select("application_id").eq("id", evId).single()).data.application_id, null);
  ok("event edited and unlinked from its application");
  await go(evPath + "/edit"); await hydrated();
  await fill({ application_id: appId }); await submit(); await onDetail("calendar/events");

  // ---------- calendar ----------
  await go(`/calendar?view=month&date=${T}`);
  assert((await cell(T))?.includes("item"), "today cell present");
  assert(await evaluate(s, `document.querySelector('[data-day="${T}"]').getAttribute('aria-current') === 'date'`), "today is highlighted");
  assert.equal(await evaluate(s, "document.querySelectorAll('[role=gridcell]').length"), 42);
  await go(`/calendar?view=month&date=${D(6)}&sel=${D(6)}`);
  let items = await dayItems();
  assert(items.some((x) => x.includes(TAG + " Sch") && /Scholarship/.test(x)), "scholarship deadline on its day: " + items.join(" | "));
  await go(`/calendar?view=month&date=${D(9)}&sel=${D(9)}`);
  items = await dayItems();
  assert(items.some((x) => x.includes(TAG + " Uni · " + TAG + " MSc") && /Application/.test(x)), "application override deadline on its day: " + items.join(" | "));
  await go(`/calendar?view=month&date=${D(4)}&sel=${D(4)}`);
  assert((await dayItems()).some((x) => x.includes(TAG + " SOP") && /Requirement/.test(x)));
  await go(`/calendar?view=month&date=${D(20)}&sel=${D(20)}`);
  assert((await dayItems()).some((x) => x.includes(TAG + " Solo") && /Program/.test(x)), "program deadline (no application) on its day");
  await go(`/calendar?view=day&date=${D(40)}`);
  assert(!(await dayItems()).some((x) => x.includes(TAG + " MSc")), "program deadline hidden: its application tracks it");
  await go(`/calendar?view=month&date=${D(3)}&sel=${D(4)}`);
  assert((await dayItems()).some((x) => x.includes(TAG + " Conference")), "multi-day event shows on a middle day");
  ok("calendar aggregates scholarship, application (override), requirement, program (no application) and events; no duplicate for a tracked program");
  await go(`/calendar?view=week&date=${D(1)}`);
  t = await text();
  assert(t.includes(TAG + " Today task (edited)") && t.includes(TAG + " Interview"), "week view lists the task and the event of that week");
  await go(`/calendar?view=day&date=${D(1)}`);
  t = await text();
  assert(t.includes(TAG + " Interview") && t.includes("15:00"), "day view shows the event and its time");
  await go(`/calendar?view=agenda&date=${T}`);
  t = await text();
  assert(t.includes(TAG + " Sch") && t.includes(TAG + " Interview") && t.includes(TAG + " Conference"));
  await go(`/calendar?view=month&date=${T}`);
  const heading = () => evaluate(s, "document.querySelector('#main h2').innerText");
  const label1 = await heading();
  await click("a[aria-label='Next month']");
  await until(async () => (await heading()) !== label1, "next month");
  await click("a[aria-label='Previous month']");
  await until(async () => (await heading()) === label1, "previous month");
  await click("a[aria-label='Next month']");
  await until(async () => (await heading()) !== label1, "next month again");
  await clickText("#main a", "Today");
  await until(async () => (await heading()) === label1, "today");
  await fill({ date: D(12) }, "document.querySelector('form[aria-label=\"Jump to date\"]')");
  await click("form[aria-label='Jump to date'] button[type=submit]");
  await until(() => evaluate(s, `location.search.includes('date=${D(12)}')`), "jump to date");
  await go("/calendar?view=bogus&date=2026-02-31");
  assert(!(await text()).includes("Something went wrong"));
  assert.equal(await evaluate(s, "document.querySelector('nav[aria-label=\"Calendar view\"] a[aria-current=page]').textContent"), "Month");
  ok("month / week / day / agenda views, previous / next / today, jump to date, invalid params fall back safely");
  for (const v of ["month", "week", "day", "agenda"]) { await go(`/calendar?view=${v}&date=${T}`); await noOverflow("calendar " + v + " 390"); }

  // ---------- deadline center ----------
  await go("/deadlines");
  const sections = await evaluate(s, "[...document.querySelectorAll('#main section')].map((x) => x.id)");
  assert(sections.includes("g-next7") && sections.includes("g-none"), "groups present: " + sections.join(","));
  const inSection = (id) => evaluate(s, `[...document.querySelectorAll('#g-${id} li a')].map((a) => a.innerText.replace(/\\s+/g, ' '))`);
  assert((await inSection("next7")).some((x) => x.includes(TAG + " Today task (edited)")), "the edited task (due tomorrow) is in the next 7 days");
  assert((await inSection("next7")).some((x) => x.includes(TAG + " Sch")) && (await inSection("next7")).some((x) => x.includes(TAG + " SOP")), "scholarship and requirement in the next 7 days");
  const grouped = (await Promise.all(["overdue", "today", "next7", "next30", "later", "none"].map(inSection))).flat();
  assert(grouped.some((x) => x.includes(TAG + " Uni · " + TAG + " MSc")), "application deadline listed");
  assert((await inSection("none")).some((x) => x.includes(TAG + " Undated task")), "undated task is in 'No deadline', never overdue");
  assert((await inSection("overdue")).some((x) => x.includes(TAG + " Overdue task")) && !(await inSection("overdue")).some((x) => x.includes(TAG + " Undated task")));
  const titlesIn = (id) => evaluate(s, `[...document.querySelectorAll('#g-${id} li a')].map((a) => a.querySelector('span.block')?.innerText.trim())`);
  const titles = (await Promise.all(["overdue", "today", "next7", "next30", "later", "none"].map(titlesIn))).flat();
  assert.equal(titles.filter((x) => x === TAG + " Uni · " + TAG + " MSc").length, 1, "the application is listed exactly once");
  assert.equal(titles.filter((x) => x === TAG + " MSc").length, 0, "its program is not listed a second time");
  ok("deadline center: mutually exclusive groups; overdue task in Overdue; unknown deadline is 'No deadline'; application tracks its program once");
  const firstSection = () => evaluate(s, "document.querySelector('#main section')?.id ?? ''");
  assert.notEqual(await firstSection(), "g-overdue", "default order shows the nearest upcoming deadlines first");
  await go("/deadlines?sort=overdue-first");
  assert.equal(await firstSection(), "g-overdue", "overdue-first puts Overdue on top");
  await go("/deadlines?type=requirement");
  assert((await text()).includes(TAG + " SOP") && !(await text()).includes(TAG + " Sch"));
  await go("/deadlines?urgency=next7&country=Testland");
  assert((await text()).includes(TAG + " Sch"));
  await go(`/deadlines?from=${D(5)}&to=${D(7)}`);
  assert((await text()).includes(TAG + " Sch") && !(await text()).includes(TAG + " SOP"));
  await go("/deadlines?application=" + appId);
  assert((await text()).includes(TAG + " SOP") && !(await text()).includes(TAG + " Sch"));
  await go("/deadlines?type=nonsense");
  assert(!(await text()).includes("Something went wrong"));
  ok("deadline filters: type, urgency + country, date range, application; overdue-first sort; hostile type");
  // closed items drop out (asserted on row titles: an open task of the application legitimately shows its name as a subtitle)
  const allTitles = () => evaluate(s, "[...document.querySelectorAll('#main section li a')].map((a) => a.querySelector('span.block')?.innerText.trim())");
  await api.from("tasks").update({ status: "completed" }).eq("id", taskId);
  await api.rpc("change_application_status", { p_id: appId, p_status: "submitted", p_today: T });
  await go("/deadlines");
  let titles2 = await allTitles();
  assert(!titles2.includes(TAG + " Today task (edited)") && !titles2.includes(TAG + " SOP") && !titles2.includes(TAG + " Uni · " + TAG + " MSc"), "completed task, requirement and submitted application are no longer pending: " + titles2.join(" | "));
  assert(titles2.includes(TAG + " Solo") && titles2.includes(TAG + " App task"), "unrelated program deadline and the still-open task remain");
  await api.rpc("change_application_status", { p_id: appId, p_status: "withdrawn", p_today: T });
  await go("/deadlines");
  titles2 = await allTitles();
  assert(!titles2.includes(TAG + " Uni · " + TAG + " MSc"), "withdrawn application is not pending");
  await go(`/calendar?view=month&date=${D(9)}&sel=${D(9)}`);
  assert(!(await dayItems()).some((x) => x.includes(TAG + " Uni · ")), "closed application leaves the calendar");
  await api.rpc("change_application_status", { p_id: appId, p_status: "preparing", p_today: T });
  await api.from("tasks").update({ status: "todo" }).eq("id", taskId);
  ok("completed, submitted and withdrawn items drop out of deadlines and the calendar");
  await go("/deadlines"); await noOverflow("deadlines 390");

  // ---------- reminders ----------
  await go("/reminders");
  const bell0 = await bell();
  await go(taskPath);
  await hydrated("form[aria-label='Add reminder']");
  await click("form[aria-label='Add reminder'] input[name=offset][value='3']");
  await click("form[aria-label='Add reminder'] button[type=submit]");
  await waitText("Reminder saved");
  await waitText("Due now");
  ok("reminder created on a task; it is due now (3 days before a task due tomorrow)");
  await bellIs(bell0 + 1, "bell counts the due reminder");
  await click("form[aria-label='Add reminder'] input[name=offset][value='3']");
  await click("form[aria-label='Add reminder'] button[type=submit]");
  await delay(800);
  assert.equal((await api.from("reminders").select("id", { count: "exact", head: true }).eq("task_id", taskId).eq("offset_days", 3)).count, 1, "duplicate reminder is not created");
  ok("adding the same reminder again is idempotent (no duplicate)");
  const reminderId = (await api.from("reminders").select("id").eq("task_id", taskId).eq("offset_days", 3).single()).data.id;
  const reminderRow = `[data-reminder="${reminderId}"]`;
  await go("/reminders");
  assert(await evaluate(s, `!!document.querySelector('[data-section=due] ${reminderRow}')`));
  const inSec = (name) => until(() => evaluate(s, `!!document.querySelector('[data-section=${name}] ${reminderRow}')`), "in " + name);
  await clickText(reminderRow + " button", "Done");
  await inSec("done");
  await bellIs(bell0, "bell drops after acknowledging");
  await clickText(reminderRow + " button", "Restore"); await inSec("due");
  await clickText(reminderRow + " button", "Dismiss"); await inSec("done");
  await clickText(reminderRow + " button", "Restore"); await inSec("due");
  await clickText(reminderRow + " button", "Disable"); await inSec("inactive");
  await bellIs(bell0, "a disabled reminder does not count");
  await clickText(reminderRow + " button", "Enable"); await inSec("due");
  ok("reminder center: acknowledge, restore, dismiss, disable and enable move reminders between sections and update the bell");
  await go("/");
  t = await text();
  assert(/Reminders/.test(t) && t.includes("This week") && /Next event/.test(t));
  assert(await evaluate(s, "!!document.querySelector('a[href*=\"/calendar?view=day\"]')"));
  assert(t.includes(TAG + " Interview"), "dashboard shows the next event");
  ok("dashboard: This week strip, due reminders and next event");
  // suggested reminder + a reminder that follows its source date
  await go("/scholarships/" + sch.id);
  await hydrated("form[aria-label='Add reminder']");
  await clickText("#main button", "Suggested");
  await until(async () => (await api.from("reminders").select("id").eq("scholarship_id", sch.id).eq("offset_days", 7)).data?.length === 1, "suggested reminder created");
  const schState = () => evaluate(s, `(() => { const li = [...document.querySelectorAll('[data-reminder]')].find((x) => x.innerText.includes(${JSON.stringify(TAG + " Sch")})); return li ? li.closest('[data-section]').getAttribute('data-section') : null; })()`);
  await go("/reminders");
  assert.equal(await schState(), "due", "7 days before a deadline 6 days away is already due");
  await api.from("scholarships").update({ application_deadline: D(30) }).eq("id", sch.id);
  await go("/reminders");
  assert.equal(await schState(), "upcoming", "the reminder follows the deadline when it moves later");
  await api.from("scholarships").update({ application_deadline: D(2) }).eq("id", sch.id);
  await go("/reminders");
  assert.equal(await schState(), "due", "...and earlier");
  ok("suggested reminder is one click and idempotent; offset reminders follow a moved deadline in both directions");
  await go("/scholarships/" + sch.id);
  assert.equal(await evaluate(s, "![...document.querySelectorAll('#main button')].some((x) => x.textContent.includes('Suggested'))"), true, "suggestion disappears once created");
  // custom time reminder on the event
  await go(evPath); await hydrated("form[aria-label='Add reminder']");
  await clickText("#main button", "custom time");
  await until(() => evaluate(s, "!!document.querySelector('input[name=remind_date]')"), "custom fields");
  await click("form[aria-label='Add reminder'] button[type=submit]");
  await waitText("Date is required");
  await fill({ remind_date: D(1), remind_time: "08:00" }, "document.querySelector('form[aria-label=\"Add reminder\"]')");
  await click("form[aria-label='Add reminder'] button[type=submit]");
  await until(async () => new Date((await api.from("reminders").select("remind_at").eq("event_id", evId).not("remind_at", "is", null)).data?.[0]?.remind_at ?? 0).toISOString() === D(1) + "T03:00:00.000Z", "custom reminder stored as the Karachi instant (08:00 -> 03:00Z)");
  ok("custom-time reminder: validation and Karachi wall-clock conversion");

  // ---------- deletion + application impact ----------
  await go("/applications/" + appId);
  await clickText("#main button", "Delete"); await dialogOpen();
  const impact = await evaluate(s, "document.querySelector('[role=dialog]').innerText");
  assert(/reminder/.test(impact) && /task/.test(impact), "application delete dialog explains tasks/reminders: " + impact);
  await clickText("[role=dialog] button", "Delete permanently");
  await until(() => evaluate(s, "!!document.querySelector('[role=dialog] [role=alert]')"), "blocked message");
  assert(/task|event/i.test(await evaluate(s, "document.querySelector('[role=dialog] [role=alert]').innerText")));
  assert((await api.from("applications").select("id").eq("id", appId)).data.length === 1);
  ok("an application with tasks or events cannot be deleted; the dialog says why");
  await go(evPath);
  await clickText("#main button", "Delete"); await dialogOpen();
  assert(/reminder/.test(await evaluate(s, "document.querySelector('[role=dialog]').innerText")));
  await clickText("[role=dialog] button", "Delete permanently");
  await until(() => evaluate(s, "location.pathname === '/calendar'"), "event deleted");
  assert.equal((await api.from("reminders").select("id", { count: "exact", head: true }).eq("event_id", evId)).count, 0);
  assert((await api.from("applications").select("id").eq("id", appId)).data.length === 1);
  await go(taskPath);
  await clickText("#main button", "Delete"); await dialogOpen();
  await clickText("[role=dialog] button", "Delete permanently");
  await until(() => evaluate(s, "location.pathname === '/tasks'"), "task deleted");
  assert.equal((await api.from("reminders").select("id", { count: "exact", head: true }).eq("task_id", taskId)).count, 0);
  ok("deleting an event or task removes its reminders and leaves the application alone");

  // ---------- offline + unsaved changes ----------
  await go("/tasks/new"); await hydrated();
  await fill({ title: TAG + " Offline task" });
  assert.equal(await evaluate(s, "(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()"), true, "unsaved task form is protected");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, s);
  await submit();
  await waitText("offline");
  assert.equal((await api.from("tasks").select("id").eq("title", TAG + " Offline task")).data.length, 0, "nothing was saved while offline");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, s);
  await submit(); await onDetail("tasks");
  ok("offline save shows a clear error, saves nothing, and the retry works once online; unsaved form is protected");

  // ---------- desktop ----------
  await desktop();
  for (const p of ["/tasks", "/tasks/new", "/calendar/events/new", "/deadlines", "/reminders", "/", `/calendar?view=month&date=${T}`, `/calendar?view=week&date=${T}`, `/calendar?view=day&date=${T}`, `/calendar?view=agenda&date=${T}`]) {
    await go(p); await noOverflow("desktop " + p);
  }
  // the reminder test moved the scholarship deadline to day +2
  await go(`/calendar?view=month&date=${D(2)}&sel=${D(2)}`);
  assert((await evaluate(s, `document.querySelector('[data-day="${D(2)}"]').innerText`)).includes(TAG + " Sch"), "desktop month cell shows the scholarship title");
  await go(`/calendar?view=week&date=${T}`);
  assert.equal(await evaluate(s, "getComputedStyle(document.querySelector('#main .grid.md\\\\:grid-cols-7')).gridTemplateColumns.split(' ').length"), 7, "desktop week view has seven columns");
  for (const [p, label] of [["/calendar", "Calendar"], ["/tasks", "Tasks"], ["/deadlines", "Deadlines"], ["/reminders", "Reminders"]]) {
    await go(p);
    assert((await evaluate(s, "document.querySelector('nav[aria-label=\"Main navigation\"] a[aria-current=page]').textContent")).includes(label), "sidebar active: " + label);
  }
  await go("/more");
  const more = await text();
  assert(more.includes("Deadlines") && more.includes("Reminders"));
  await phone();
  await go("/");
  assert.equal(await evaluate(s, "document.querySelectorAll('nav[aria-label=\"Mobile navigation\"] a').length"), 5, "bottom bar still has five items");
  await go("/calendar/events/new");
  assert(await evaluate(s, "!!document.querySelector('nav[aria-label=\"Mobile navigation\"] a[aria-current=page]')?.textContent.includes('Calendar')"), "Calendar stays active on event pages");
  ok("1440px and 390px: no overflow on any Phase 7 page; desktop grid/week; sidebar active routes; More lists Deadlines and Reminders; bottom bar unchanged");

  const errs = b.errors.filter((e) => !/favicon|Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(e));
  assert.equal(errs.length, 0, "console/runtime errors: " + errs.join(" | "));
  ok("no console or hydration errors");
  console.log("\nALL PHASE 7 UI CHECKS PASSED");
} catch (e) {
  console.error("FAIL: " + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  await b.close();
  // Reminders cascade with their sources, so removing the tagged sources removes them too.
  await api.from("tasks").delete().ilike("title", "ZZ-P7-UI %");
  await api.from("events").delete().ilike("title", "ZZ-P7-UI %");
  const unis = (await api.from("universities").select("id").ilike("name", "ZZ-P7-UI %")).data ?? [];
  for (const u of unis) { for (const p of (await api.from("programs").select("id").eq("university_id", u.id)).data ?? []) await api.from("applications").delete().eq("program_id", p.id); }
  await api.from("scholarships").delete().ilike("name", "ZZ-P7-UI %");
  for (const u of unis) await api.from("programs").delete().eq("university_id", u.id);
  await api.from("universities").delete().ilike("name", "ZZ-P7-UI %");
  const left = await Promise.all([["tasks", "title"], ["events", "title"], ["universities", "name"], ["scholarships", "name"]].map(async ([t, c]) => (await api.from(t).select("id", { count: "exact", head: true }).ilike(c, "ZZ-P7-UI %")).count));
  console.log("CLEANUP: leftover tasks/events/universities/scholarships = " + left.join("/"));
  if (left.some((n) => n !== 0)) process.exitCode = 1;
}
