// Phase 5 interaction checks for migration-dependent controls and unsaved-changes protection.
// Needs the Phase 5 migration applied and a production server on :3100. Records are "ZZ-P5-X ..." and swept in finally.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { launch, origin } from "./lib/cdp.mjs";

nextEnv.loadEnvConfig(process.cwd());
const b = await launch();
const { send, evaluate, until } = b;
const ok = (m) => console.log("PASS: " + m);
const TAG = "ZZ-P5-X " + Date.now().toString().slice(-6);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fmt = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
let s;

const go = async (path) => {
  await send("Page.navigate", { url: origin + path }, s);
  await until(() => evaluate(s, `location.pathname === ${JSON.stringify(path.split("?")[0])} && !!document.querySelector('#main h1')`), "navigate " + path);
};
const text = () => evaluate(s, "document.querySelector('#main').innerText");
const waitText = (t, label) => until(async () => (await text()).includes(t), label ?? t);
const fill = (values) => evaluate(s, `(() => { const v = ${JSON.stringify(values)};
  for (const [n, val] of Object.entries(v)) { const el = document.querySelector('[name=' + n + ']');
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
const setChecked = (name, on) => evaluate(s, `(() => { const el = document.querySelector('[name=${name}]'); if (el.checked !== ${on}) el.click(); })()`);
const submit = () => evaluate(s, "document.querySelector('#main form button[type=submit]').click()");
const onDetail = (seg) => until(() => evaluate(s, `new RegExp('^/${seg}/[0-9a-f-]{36}$').test(location.pathname)`), "detail " + seg);
const hydrated = () => until(() => evaluate(s, "Object.keys(document.querySelector('#main form') ?? {}).some((k) => k.startsWith('__reactProps'))"), "form hydrated");
const clickText = (sel, t) => evaluate(s, `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(t)}))?.click()`);
const linkVia = (label, optionText) => evaluate(s, `(() => { const sel = document.querySelector('select[aria-label="${label}"]'); const o = [...sel.options].find((o) => o.textContent.includes(${JSON.stringify(optionText)}));
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); sel.form.requestSubmit(); })()`);
const armConfirm = (answer) => evaluate(s, `window.__confirms = []; window.confirm = (m) => { window.__confirms.push(m); return ${answer}; }`);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

try {
  s = await b.tab();
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
  await b.loginOwner(s);

  // ---------- university type + preferred ----------
  await go("/universities/new");
  assert(await evaluate(s, "!!document.querySelector('[name=university_type]') && !!document.querySelector('[name=is_preferred]')"), "extras fields rendered");
  await hydrated();
  await fill({ name: TAG + " Uni", country: "Testland", university_type: "private" });
  await setChecked("is_preferred", true);
  await submit(); await onDetail("universities");
  const uniPath = await evaluate(s, "location.pathname"), uniId = uniPath.split("/").pop();
  let t = await text();
  assert(t.includes("Preferred") && t.includes("Private"));
  ok("university saved with type Private and Preferred (detail shows both badges)");
  await go("/universities?q=" + encodeURIComponent(TAG) + "&preferred=1");
  assert((await text()).includes(TAG + " Uni") && await evaluate(s, "!!document.querySelector('#main svg[aria-label=Preferred]')"));
  ok("preferred filter lists it, with the star in the list");
  await go(uniPath + "/edit"); await hydrated();
  assert.equal(await evaluate(s, "document.querySelector('[name=is_preferred]').checked"), true);
  assert.equal(await evaluate(s, "document.querySelector('[name=university_type]').value"), "private");
  await fill({ university_type: "public" });
  await setChecked("is_preferred", false);
  await submit(); await onDetail("universities");
  t = await text();
  assert(!t.includes("Preferred") && t.includes("Public") && !t.includes("Private"));
  await go("/universities?q=" + encodeURIComponent(TAG) + "&preferred=1");
  assert((await text()).includes("No universities match"));
  ok("edit: type changed to Public and preferred toggled off; preferred filter no longer matches");

  // ---------- program for linking ----------
  await go("/programs/new?university=" + uniId); await hydrated();
  await fill({ name: TAG + " MSc" });
  await submit(); await onDetail("programs");
  const progPath = await evaluate(s, "location.pathname");

  // ---------- scholarship: opening date + all funding types ----------
  await go("/scholarships/new"); await hydrated();
  const types = await evaluate(s, "[...document.querySelector('[name=funding_type]').options].map((o) => o.value)");
  assert.deepEqual(types, ["", "full", "partial", "tuition_waiver", "stipend", "other"]);
  ok("funding type select offers all five types");
  await fill({ name: TAG + " Schol", opening_date: addDays(30), application_deadline: addDays(10) });
  await submit();
  await waitText("Opening date must be on or before the deadline");
  ok("opening date after the deadline is rejected inline");
  await fill({ opening_date: addDays(2), application_deadline: addDays(40), funding_type: "full" });
  await submit(); await onDetail("scholarships");
  const schPath = await evaluate(s, "location.pathname");
  t = await text();
  assert(/opens/i.test(t) && t.includes(fmt(addDays(2))) && t.includes("Fully funded"));
  ok("opening date saved and shown without timezone shift");
  for (const [value, label] of [["partial", "Partially funded"], ["tuition_waiver", "Tuition waiver"], ["stipend", "Stipend"], ["other", "Other"], ["full", "Fully funded"]]) {
    await go(schPath + "/edit"); await hydrated();
    await fill({ funding_type: value });
    await submit(); await onDetail("scholarships");
    await waitText(label, "funding label " + label);
    await go("/scholarships?q=" + encodeURIComponent(TAG) + "&funding=" + value);
    assert((await text()).includes(TAG + " Schol"), "funding filter " + value);
  }
  ok("all five funding types save, display their label, and filter correctly");

  // ---------- linking / unlinking ----------
  await go(schPath);
  assert((await text()).includes("Not linked to any program") && (await text()).includes("independently of any university"));
  await linkVia("Program to link", TAG + " MSc");
  await until(async () => !(await text()).includes("Not linked to any program"), "program linked");
  assert(!(await text()).includes("Not linked to any program"));
  ok("scholarship linked to a program");
  await go(progPath);
  assert((await text()).includes(TAG + " Schol"));
  ok("program detail shows the linked scholarship");
  await go(schPath);
  await linkVia("University to link", TAG + " Uni");
  await until(async () => !(await text()).includes("independently of any university"), "university linked");
  await go(uniPath);
  assert((await text()).includes("Linked scholarships") && (await text()).includes(TAG + " Schol"));
  ok("scholarship linked to a university; university detail lists it");
  // linked items disappear from the "choose" lists
  await go(schPath);
  assert(await evaluate(s, `![...(document.querySelector('select[aria-label="Program to link"]')?.options ?? [])].some((o) => o.textContent.includes(${JSON.stringify(TAG + " MSc")}))`));
  // unlink both
  await evaluate(s, "document.querySelector('button[aria-label^=\"Unlink ' + " + JSON.stringify(TAG + " MSc") + " + '\"]').click()");
  await waitText("Not linked to any program", "program unlinked");
  await evaluate(s, "document.querySelector('button[aria-label^=\"Unlink ' + " + JSON.stringify(TAG + " Uni") + " + '\"]').click()");
  await waitText("independently of any university", "university unlinked");
  await go(progPath);
  assert(!(await text()).includes(TAG + " Schol"));
  ok("unlinking removes both links (program page no longer lists the scholarship)");
  // relink, then delete the scholarship: links must not block it
  await go(schPath);
  await linkVia("Program to link", TAG + " MSc");
  await until(async () => !(await text()).includes("Not linked to any program"), "relinked");
  await clickText("#main button", "Delete");
  await until(() => evaluate(s, "!!document.querySelector('[role=dialog]')"), "dialog");
  assert((await evaluate(s, "document.querySelector('[role=dialog]').innerText")).includes("links will be removed"));
  await clickText("[role=dialog] button", "Delete permanently");
  await until(() => evaluate(s, "location.pathname === '/scholarships'"), "deleted scholarship with links");
  ok("deleting a linked scholarship states the link impact and succeeds (links cascade)");

  // ---------- unsaved-changes protection ----------
  await go("/universities/new"); await hydrated();
  await armConfirm(false);
  const beforeunload = () => evaluate(s, "(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()");
  assert.equal(await beforeunload(), false, "clean form does not block unload");
  await evaluate(s, "document.querySelector('a[href=\"/programs\"]').click()");
  await until(() => evaluate(s, "location.pathname === '/programs'"), "clean form navigates freely");
  assert.equal(await evaluate(s, "window.__confirms?.length ?? 0"), 0);
  ok("clean form: sidebar navigation and unload are not blocked");

  await go("/universities/new"); await hydrated();
  await armConfirm(false);
  await fill({ name: TAG + " Dirty" });
  assert.equal(await beforeunload(), true, "dirty form blocks reload/close");
  ok("dirty form: beforeunload (reload/close) is armed");
  for (const sel of ['nav[aria-label="Main navigation"] a[href="/scholarships"]', 'nav[aria-label="Main navigation"] a[href="/programs"]', '#main form a[href="/universities"]']) {
    await evaluate(s, `document.querySelector(${JSON.stringify(sel)}).click()`);
    await b.delay(300);
    assert.equal(await evaluate(s, "location.pathname"), "/universities/new", "declined confirm keeps the user on the form: " + sel);
  }
  assert((await evaluate(s, "window.__confirms.length")) >= 3);
  assert.equal(await evaluate(s, "document.querySelector('[name=name]').value"), TAG + " Dirty");
  ok("dirty form: sidebar and Cancel links ask first; declining keeps the page and typed values");
  await armConfirm(true);
  await evaluate(s, "document.querySelector('nav[aria-label=\"Main navigation\"] a[href=\"/scholarships\"]').click()");
  await until(() => evaluate(s, "location.pathname === '/scholarships'"), "accepted confirm navigates");
  assert.equal(await evaluate(s, "window.__confirms.length"), 1);
  ok("accepting the confirmation discards changes and navigates");

  // a failed save keeps protection; a successful save does not prompt
  await go("/universities/new"); await hydrated();
  await armConfirm(false);
  await fill({ name: TAG + " Saved", country: "" });
  await submit(); await waitText("Country is required");
  assert.equal(await beforeunload(), true, "form stays protected after a failed save");
  await fill({ country: "Testland" });
  await submit(); await onDetail("universities");
  assert.equal(await evaluate(s, "window.__confirms?.length ?? 0"), 0, "successful save never prompts");
  ok("failed save stays protected; successful save redirects without any prompt");

  const errs = b.errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  assert.equal(errs.length, 0, "console/runtime errors: " + errs.join(" | "));
  ok("no console or hydration errors");
  console.log("\nALL PHASE 5 EXTRAS CHECKS PASSED");
} catch (e) {
  console.error("FAIL: " + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  await b.close();
  const { error } = await admin.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_OWNER_EMAIL, password: process.env.SUPABASE_TEST_OWNER_PASSWORD });
  if (!error) {
    const unis = (await admin.from("universities").select("id").ilike("name", "ZZ-P5-X %")).data ?? [];
    await admin.from("scholarships").delete().ilike("name", "ZZ-P5-X %");
    for (const u of unis) await admin.from("programs").delete().eq("university_id", u.id);
    await admin.from("universities").delete().ilike("name", "ZZ-P5-X %");
    const left = (await admin.from("universities").select("id", { count: "exact", head: true }).ilike("name", "ZZ-P5-X %")).count;
    console.log("CLEANUP: leftover extras test universities = " + left);
  }
}
