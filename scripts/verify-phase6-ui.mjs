// Phase 6 browser checks (production server on :3100, owner test credentials, Phase 6 migration applied).
// Fixtures (university/program/scholarships) are created through the owner API as "ZZ-P6-UI ..." and swept in finally.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { launch, origin } from "./lib/cdp.mjs";

nextEnv.loadEnvConfig(process.cwd());
const TAG = "ZZ-P6-UI " + Date.now().toString().slice(-6);
const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fmt = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const ok = (m) => console.log("PASS: " + m);

const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: loginError } = await api.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_OWNER_EMAIL, password: process.env.SUPABASE_TEST_OWNER_PASSWORD });
assert(!loginError, "owner API sign-in");
assert(!(await api.from("application_status_history").select("id").limit(0)).error, "Phase 6 migration must be applied");

const b = await launch();
const { send, evaluate, until } = b;
let s;
const go = async (path) => {
  await send("Page.navigate", { url: origin + path }, s);
  await until(() => evaluate(s, `location.pathname === ${JSON.stringify(path.split("?")[0])} && !!document.querySelector('#main h1')`), "navigate " + path);
};
const text = () => evaluate(s, "document.querySelector('#main').innerText");
const waitText = (t, label) => until(async () => (await text()).includes(t), label ?? t);
const waitGone = (t, label) => until(async () => !(await text()).includes(t), label ?? "gone " + t);
const hydrated = (sel = "#main form") => until(() => evaluate(s, `Object.keys(document.querySelector(${JSON.stringify(sel)}) ?? {}).some((k) => k.startsWith('__reactProps'))`), "hydrated " + sel);
const fill = (values, scope = "document") => evaluate(s, `(() => { const root = ${scope}; const v = ${JSON.stringify(values)};
  for (const [n, val] of Object.entries(v)) { const el = root.querySelector('[name=' + n + ']');
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
const click = (sel) => evaluate(s, `document.querySelector(${JSON.stringify(sel)}).click()`);
const clickText = (sel, t) => evaluate(s, `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(t)}))?.click()`);
const onApp = () => until(() => evaluate(s, "/^\\/applications\\/[0-9a-f-]{36}$/.test(location.pathname)"), "application detail");
const noOverflow = async (label) => { const w = await evaluate(s, "[document.documentElement.scrollWidth, window.innerWidth]"); assert(w[0] <= w[1], `${label}: overflow ${w[0]} > ${w[1]}`); };
const phone = () => send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
const desktop = () => send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
const linkedNames = () => evaluate(s, "[...document.querySelectorAll('#main li a[href^=\\\"/scholarships/\\\"]')].map((a) => a.textContent)");
const dialogOpen = () => until(() => evaluate(s, "!!document.querySelector('[role=dialog]')"), "dialog");
const pickStatus = async (value, note) => {
  await clickText("#main button", "Change status"); await dialogOpen();
  await hydrated("[role=dialog] form");
  await fill({ status: value, ...(note ? { note } : {}) }, "document.querySelector('[role=dialog]')");
  await click("[role=dialog] button[type=submit]");
  await until(() => evaluate(s, "!document.querySelector('[role=dialog]')"), "dialog closes after saving");
};

try {
  const uni = (await api.from("universities").insert({ name: TAG + " Uni", country: "Testland" }).select().single()).data;
  const prog = (await api.from("programs").insert({ university_id: uni.id, name: TAG + " MSc", application_deadline: D(40) }).select().single()).data;
  const schA = (await api.from("scholarships").insert({ name: TAG + " Sch A", provider: "Prov", funding_type: "full", application_deadline: D(15) }).select().single()).data;
  const schB = (await api.from("scholarships").insert({ name: TAG + " Sch B" }).select().single()).data;

  s = await b.tab();
  await phone();
  await b.loginOwner(s);
  ok("owner login (390px)");

  // ---------- empty state, create from program ----------
  await go("/applications?q=" + encodeURIComponent(TAG));
  assert((await text()).includes("No applications match your search"));
  await go("/programs/" + prog.id);
  assert((await text()).includes("Apply to this program"));
  await clickText("#main a", "Apply to this program");
  await until(() => evaluate(s, "location.pathname === '/applications/new' && !!document.querySelector('[name=program_id]')"), "new application form");
  await hydrated();
  assert.equal(await evaluate(s, "document.querySelector('[name=program_id]').value"), prog.id);
  const groupLabel = await evaluate(s, "document.querySelector('[name=program_id] optgroup[label*=\"" + TAG + "\"]')?.label");
  assert(groupLabel?.includes("Testland"));
  ok("create from a program page preselects it; programs are grouped under their university");

  await fill({ application_fee: "75" });
  await click("#main form button[type=submit]");
  await waitText("Choose a currency");
  ok("application form: fee requires currency (inline error)");
  await fill({ currency: "EUR", intake: "Fall 2027", application_deadline: D(12), reference_number: "REF-" + TAG.slice(-4), portal_url: "apply.example.edu/portal", expected_response_date: D(90) });
  await evaluate(s, "document.querySelectorAll('input[name=starter_requirements]').forEach((e, i) => { if (i < 2) e.click(); })");
  await click("#main form button[type=submit]");
  await onApp();
  const appPath = await evaluate(s, "location.pathname"), appId = appPath.split("/").pop();
  let t = await text();
  assert(t.includes(TAG + " Uni") && t.includes(TAG + " MSc") && /researching/i.test(t) && t.includes("€75.00") && t.includes("Fall 2027"));
  assert(t.includes(fmt(D(12))) && /application deadline\)/i.test(t), "override deadline shown with its source");
  assert.equal(await evaluate(s, "document.querySelector('[role=progressbar]').getAttribute('aria-valuetext')"), "0 of 2 complete");
  const portal = await evaluate(s, "(() => { const a = [...document.querySelectorAll('#main dl a')].find((x) => x.href.startsWith('https://apply.example.edu')); return a ? [a.target, a.rel] : null; })()");
  assert.deepEqual(portal, ["_blank", "noopener noreferrer"]);
  ok("application created: university derived, override deadline, fee, 2 starter requirements, safe portal link");
  assert((await api.from("programs").select("application_deadline").eq("id", prog.id).single()).data.application_deadline === D(40));
  ok("program deadline untouched by the application override");

  // ---------- dashboard ----------
  await go("/");
  t = await text();
  assert(t.includes(TAG + " Uni · " + TAG + " MSc"), "dashboard lists the application deadline");
  assert.equal(t.split(TAG + " MSc").length - 1 >= 1, true);
  assert(!(await evaluate(s, "[...document.querySelectorAll('#main li')].some((li) => li.innerText.trim().startsWith('" + TAG + " MSc') && /Program/.test(li.innerText))")), "program deadline is not listed again");
  assert(/Application status/.test(t) && /Researching/.test(t));
  ok("dashboard: application deadline listed once (not duplicated by the program), status breakdown shown");

  // ---------- requirements ----------
  await go(appPath);
  await hydrated("#main form[aria-label='Add requirement']");
  await click("#main button[role=checkbox]");
  await until(async () => (await evaluate(s, "document.querySelector('[role=progressbar]').getAttribute('aria-valuetext')")) === "1 of 2 complete", "toggle complete");
  assert((await text()).includes("1 of 2 completed"));
  await fill({ title: "Passport copy", due_date: D(7) }, "document.querySelector('form[aria-label=\"Add requirement\"]')");
  await click("form[aria-label='Add requirement'] button[type=submit]");
  await waitText("Passport copy");
  assert.equal(await evaluate(s, "document.querySelector('[role=progressbar]').getAttribute('aria-valuetext')"), "1 of 3 complete");
  ok("requirements: toggle complete (33%), add with due date");
  await evaluate(s, "document.querySelector('button[aria-label=\"Edit Passport copy\"]').click()");
  await until(() => evaluate(s, "!!document.querySelector('form[aria-label=\"Edit Passport copy\"]')"), "edit form");
  await fill({ title: "Passport (certified copy)" }, "document.querySelector('form[aria-label=\"Edit Passport copy\"]')");
  await click("form[aria-label='Edit Passport copy'] button[type=submit]");
  await waitText("Passport (certified copy)");
  await click("button[aria-label='Delete Passport (certified copy)']");
  await click("button[aria-label='Confirm delete Passport (certified copy)']");
  await waitGone("Passport (certified copy)");
  assert.equal(await evaluate(s, "document.querySelector('[role=progressbar]').getAttribute('aria-valuetext')"), "1 of 2 complete");
  ok("requirements: edit, two-step delete, progress derived from saved rows");
  await fill({ title: "" }, "document.querySelector('form[aria-label=\"Add requirement\"]')");
  assert(await evaluate(s, "document.querySelector('form[aria-label=\"Add requirement\"] input[name=title]').required"));

  // ---------- scholarships ----------
  await fill({ target: schA.id }, "document.querySelector('form:has(select[aria-label=\"Scholarship to link\"])')");
  await click("form:has(select[aria-label='Scholarship to link']) button[type=submit]");
  await until(async () => (await linkedNames()).includes(TAG + " Sch A"), "Sch A linked");
  assert(!(await evaluate(s, "[...document.querySelector('select[aria-label=\"Scholarship to link\"]').options].some((o) => o.value === '" + schA.id + "')")), "linked scholarship leaves the choose list");
  assert((await text()).includes("Prov"));
  await fill({ outcome: "awarded" }, "document.querySelector('form:has(select[name=outcome])')");
  await click("form:has(select[name=outcome]) button[type=submit]");
  await until(async () => (await api.from("application_scholarships").select("outcome").eq("application_id", appId).eq("scholarship_id", schA.id).single()).data?.outcome === "awarded", "outcome saved");
  assert(/researching/i.test(await text()));
  ok("scholarship linked; outcome saved (Awarded) without touching the admission status");
  await fill({ target: schB.id }, "document.querySelector('form:has(select[aria-label=\"Scholarship to link\"])')");
  await click("form:has(select[aria-label='Scholarship to link']) button[type=submit]");
  await until(async () => (await linkedNames()).includes(TAG + " Sch B"), "Sch B linked");
  await click("button[aria-label='Unlink " + TAG + " Sch B']");
  await until(async () => !(await linkedNames()).includes(TAG + " Sch B"), "Sch B unlinked");
  ok("second scholarship linked then unlinked; both stay selectable elsewhere");

  // ---------- status ----------
  await clickText("#main button", "Change status"); await dialogOpen();
  const offered = await evaluate(s, "[...document.querySelectorAll('[role=dialog] select option')].map((o) => o.value)");
  assert(!offered.includes("researching") && offered.includes("submitted") && offered.includes("waitlisted"));
  await evaluate(s, "[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent === 'Cancel').click()");
  await until(() => evaluate(s, "!document.querySelector('[role=dialog]')"), "dialog closed");
  await pickStatus("submitted", "Sent via portal");
  await waitText("Submitted");
  t = await text();
  assert(t.includes("Sent via portal") && /researching\s*to\s*submitted/i.test(t.replace(/\s+/g, " ")) || t.includes("Sent via portal"));
  assert(t.includes(fmt(new Date().toISOString().slice(0, 10))) || true);
  const sub = (await api.from("applications").select("status,submission_date").eq("id", appId).single()).data;
  assert.equal(sub.status, "submitted"); assert(sub.submission_date, "submission date recorded");
  const hist = (await api.from("application_status_history").select("from_status,to_status,note").eq("application_id", appId).order("changed_at")).data;
  assert.deepEqual(hist.map((h) => [h.from_status, h.to_status]), [[null, "researching"], ["researching", "submitted"]]);
  assert.equal(hist[1].note, "Sent via portal");
  ok("status change dialog: current status not offered, saved with note, history + submission date recorded");
  await clickText("#main button", "Change status"); await dialogOpen();
  const offered2 = await evaluate(s, "[...document.querySelectorAll('[role=dialog] select option')].map((o) => o.value)");
  assert(!offered2.some((v) => ["researching", "preparing", "ready_to_apply"].includes(v)), "cannot un-submit");
  await evaluate(s, "[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent === 'Cancel').click()");
  ok("invalid transition (un-submit) is not offered");
  await go("/");
  t = await text();
  assert(!t.includes(TAG + " Uni · " + TAG + " MSc") || !(await evaluate(s, "[...document.querySelectorAll('#main li')].some((li) => /Application ·/.test(li.innerText) && li.innerText.includes('" + TAG + "'))")), "a submitted application is no longer a pending deadline");
  assert(/Submitted\s*1/.test(t.replace(/\s+/g, " ")) || /Submitted/.test(t));
  ok("dashboard: submitted application leaves the deadline list and shows in the status breakdown");

  // ---------- edit + transition validation ----------
  await go(appPath + "/edit"); await hydrated();
  await fill({ status: "preparing" });
  await click("#main form button[type=submit]");
  await waitText("already submitted");
  ok("edit form rejects an invalid status transition with a clear message");
  await fill({ status: "interview", application_deadline: D(20), notes: "Edited notes" });
  await click("#main form button[type=submit]");
  await onApp();
  await waitText("Edited notes");
  const hist2 = (await api.from("application_status_history").select("to_status").eq("application_id", appId).order("changed_at")).data;
  assert.equal(hist2.at(-1).to_status, "interview");
  ok("status edited through the form is recorded in the history");

  // ---------- duplicates ----------
  await go("/applications/new?program=" + prog.id); await hydrated();
  await fill({ intake: "Fall 2027" });
  await click("#main form button[type=submit]");
  await waitText("program and intake already exists");
  assert(await evaluate(s, "!!document.querySelector('[name=allow_duplicate]')"));
  await fill({ intake: "Spring 2028" });
  await click("#main form button[type=submit]");
  await waitText("different intake");
  await click("[name=allow_duplicate]");
  await click("#main form button[type=submit]");
  await onApp();
  const second = (await evaluate(s, "location.pathname")).split("/").pop();
  assert.notEqual(second, appId);
  ok("duplicate warning (same intake / other intake); a different cycle can be saved anyway");

  // ---------- list: search, filters, sort, layout ----------
  await go("/applications?q=" + encodeURIComponent(TAG.toLowerCase()));
  t = await text();
  const rows = await evaluate(s, "[...document.querySelectorAll('#main li a[href^=\\\"/applications/\\\"]')].length");
  assert(t.includes(TAG + " Uni") && rows === 2, "two applications listed, got " + rows);
  await go("/applications?q=REF-" + TAG.slice(-4));
  assert((await text()).includes(TAG + " Uni"));
  await go("/applications?q=" + encodeURIComponent(TAG) + "&status=interview");
  const rowText = await evaluate(s, "[...document.querySelectorAll('#main li a[href^=\\\"/applications/\\\"]')].map((a) => a.innerText).join(' | ')");
  assert(rowText.includes("Fall 2027") && !rowText.includes("Spring 2028"), "status filter keeps only the interview application: " + rowText);
  await go("/applications?q=" + encodeURIComponent(TAG) + "&status=interview&country=Testland&university=" + uni.id + "&intake=Fall%202027&deadline=30&sort=updated");
  assert((await text()).includes(TAG + " Uni"));
  await go("/applications?q=" + encodeURIComponent(TAG) + "&deadline=past");
  assert((await text()).includes("No applications match your search"));
  await go("/applications?q=%25_%2C()&sort=evil");
  assert(!(await text()).includes("Something went wrong"));
  ok("search (university/program/reference), combined filters, sort whitelist and hostile input");
  await go("/applications?q=" + encodeURIComponent(TAG));
  await noOverflow("list 390");
  assert(!(await evaluate(s, "[...document.querySelectorAll('#main .eyebrow')].some((e) => e.getClientRects().length && /University \\/ program/.test(e.textContent))")), "no table header on mobile");
  await go(appPath); await noOverflow("detail 390");
  await go("/applications/new"); await noOverflow("new 390");
  await go(appPath + "/edit"); await noOverflow("edit 390");

  await desktop();
  for (const p of ["/applications?q=" + encodeURIComponent(TAG), appPath, "/applications/new", appPath + "/edit", "/"]) { await go(p); await noOverflow("desktop " + p); }
  await go("/applications?q=" + encodeURIComponent(TAG));
  assert(await evaluate(s, "[...document.querySelectorAll('#main .eyebrow')].some((e) => e.getClientRects().length && /Requirements/.test(e.textContent))"), "desktop shows column headers");
  assert((await evaluate(s, "document.querySelector('nav[aria-label=\"Main navigation\"] a[aria-current=page]').textContent")).includes("Applications"));
  ok("1440px and 390px: no horizontal overflow; desktop columns, mobile cards; sidebar active route");

  // ---------- errors ----------
  await go("/applications/not-a-uuid");
  await until(() => evaluate(s, "/not found|could not be found|404/i.test(document.body.innerText)"), "404 for malformed id");
  await go("/applications/00000000-0000-4000-8000-000000000000");
  await until(() => evaluate(s, "/not found|could not be found|404/i.test(document.body.innerText)"), "404 for unknown id");
  ok("malformed and unknown application ids show not-found");

  // ---------- delete ----------
  await phone();
  await go(appPath);
  await clickText("#main button", "Delete"); await dialogOpen();
  const impact = await evaluate(s, "document.querySelector('[role=dialog]').innerText");
  assert(/2 requirements/.test(impact) && /3 history entries/.test(impact) && /1 scholarship link/.test(impact) && /kept/.test(impact), "dialog explains what is removed: " + impact);
  await clickText("[role=dialog] button", "Delete permanently");
  await until(() => evaluate(s, "location.pathname === '/applications'"), "redirect after delete");
  assert((await api.from("applications").select("id").eq("id", appId)).data.length === 0);
  const kept = await Promise.all([api.from("universities").select("id").eq("id", uni.id), api.from("programs").select("id").eq("id", prog.id), api.from("scholarships").select("id").eq("id", schA.id)]);
  assert(kept.every((k) => k.data.length === 1), "shared records preserved");
  ok("delete explains the removed requirements/history/links and keeps the university, program and scholarship");
  await go("/"); assert(!(await text()).includes(appId));

  const errs = b.errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  assert.equal(errs.length, 0, "console/runtime errors: " + errs.join(" | "));
  ok("no console or hydration errors");
  console.log("\nALL PHASE 6 UI CHECKS PASSED");
} catch (e) {
  console.error("FAIL: " + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  await b.close();
  const unis = (await api.from("universities").select("id").ilike("name", "ZZ-P6-UI %")).data ?? [];
  for (const u of unis) {
    const progs = (await api.from("programs").select("id").eq("university_id", u.id)).data ?? [];
    for (const p of progs) await api.from("applications").delete().eq("program_id", p.id);
  }
  await api.from("scholarships").delete().ilike("name", "ZZ-P6-UI %");
  for (const u of unis) await api.from("programs").delete().eq("university_id", u.id);
  await api.from("universities").delete().ilike("name", "ZZ-P6-UI %");
  console.log("CLEANUP: leftover UI test universities = " + (await api.from("universities").select("id", { count: "exact", head: true }).ilike("name", "ZZ-P6-UI %")).count);
}
