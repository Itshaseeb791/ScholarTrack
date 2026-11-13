// Phase 5 browser checks (production server on :3100, owner test credentials in .env.local).
// Drives real add/edit/delete/search/validation flows at 390px and 1440px. Records are named "ZZ-P5-UI ...",
// removed through the UI, and swept again by name in finally.
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { launch, origin } from "./lib/cdp.mjs";

nextEnv.loadEnvConfig(process.cwd());
const b = await launch();
const { send, evaluate, until } = b;
const ok = (m) => console.log("PASS: " + m);
const phone = (s) => send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
const desktop = (s) => send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
const TAG = "ZZ-P5-UI " + Date.now().toString().slice(-6);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let s;

const go = async (path, ready = "!!document.querySelector('#main h1')") => {
  await send("Page.navigate", { url: origin + path }, s);
  await until(() => evaluate(s, `location.pathname + location.search === ${JSON.stringify(path)} || location.pathname === ${JSON.stringify(path.split("?")[0])}`), "navigate " + path);
  await until(() => evaluate(s, ready), "ready " + path);
};
const text = () => evaluate(s, "document.querySelector('#main').innerText");
const fill = (values) => evaluate(s, `(() => { const v = ${JSON.stringify(values)};
  for (const [n, val] of Object.entries(v)) { const el = document.querySelector('[name=' + n + ']');
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
const submit = () => evaluate(s, "document.querySelector('#main form button[type=submit]').click()");
const noOverflow = async (label) => {
  const w = await evaluate(s, "[document.documentElement.scrollWidth, window.innerWidth]");
  assert(w[0] <= w[1], `${label}: horizontal overflow ${w[0]} > ${w[1]}`);
};
const clickText = (sel, t) => evaluate(s, `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(t)}))?.click()`);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

try {
  s = await b.tab();
  await phone(s);
  await b.loginOwner(s);
  ok("owner login");

  // ---------- empty states + nav (mobile) ----------
  await go("/universities?q=zz-no-such-thing-" + Date.now());
  assert((await text()).includes("No universities match your search"), "filtered-empty state");
  assert((await text()).includes("clear the filters"));
  ok("empty search result is distinct from empty database (universities)");
  await go("/more");
  const more = await text();
  assert(more.includes("Programs") && more.includes("Universities") && more.includes("Scholarships"), "More lists new routes");
  ok("More page links Programs, Universities, Scholarships");

  // ---------- university: validation + create (mobile) ----------
  await go("/universities/new");
  await submit();
  await until(async () => (await text()).includes("Name is required."), "server validation");
  assert((await text()).includes("Country is required."));
  ok("university form: required-field errors from the server");
  await fill({ name: TAG + " University", country: "Testland", website: "not a url" });
  await submit();
  await until(async () => (await text()).includes("valid web address"), "url error");
  ok("university form: invalid URL rejected, typed values preserved");
  assert.equal(await evaluate(s, "document.querySelector('[name=name]').value"), TAG + " University");
  await fill({ website: "example.edu", city: "Testville" });
  await submit();
  await until(() => evaluate(s, "/^\\/universities\\/[0-9a-f-]{36}$/.test(location.pathname)"), "redirect to detail");
  const uniPath = await evaluate(s, "location.pathname");
  const uniId = uniPath.split("/").pop();
  assert((await text()).includes(TAG + " University"));
  const link = await evaluate(s, "(() => { const a = document.querySelector('#main dl a[href^=http]'); return [a.getAttribute('href'), a.target, a.rel]; })()");
  assert.deepEqual(link, ["https://example.edu/", "_blank", "noopener noreferrer"]);
  ok("university created; website normalized; external link is safe");
  await noOverflow("university detail 390");

  // duplicate warning
  await go("/universities/new");
  await fill({ name: TAG + " University", country: "Testland" });
  await submit();
  await until(async () => (await text()).includes("similar record already exists"), "duplicate warning");
  assert(await evaluate(s, "!!document.querySelector('[name=allow_duplicate]')"));
  ok("duplicate university warns and offers Save anyway (not saved)");

  // ---------- program from university page ----------
  await go(uniPath);
  await evaluate(s, "[...document.querySelectorAll('#main a')].find((a) => a.textContent.includes('Add program')).click()");
  await until(() => evaluate(s, "location.pathname === '/programs/new' && !!document.querySelector('[name=university_id]')"), "program form");
  assert.equal(await evaluate(s, "document.querySelector('[name=university_id]').value"), uniId);
  ok("Add program from university pre-selects that university");
  await fill({ name: TAG + " MSc", tuition_fee: "1200", application_deadline: addDays(10), field_of_study: "Testing" });
  await submit();
  await until(async () => (await text()).includes("Choose a currency"), "currency error");
  ok("program form: tuition requires currency (inline error)");
  await fill({ currency: "EUR", official_url: "https://example.edu/msc" });
  await submit();
  await until(() => evaluate(s, "/^\\/programs\\/[0-9a-f-]{36}$/.test(location.pathname)"), "program detail");
  const progPath = await evaluate(s, "location.pathname");
  let t = await text();
  assert(t.includes(TAG + " MSc") && t.includes("€1,200.00") && t.includes(TAG + " University"));
  ok("program created and shows university, tuition, deadline");
  // date-only deadline must not shift
  const shown = await evaluate(s, "document.querySelector('#main dl dd').innerText");
  const expect = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(addDays(10) + "T00:00:00Z"));
  assert(shown.includes(expect), `deadline shows ${expect}, got ${shown}`);
  ok("date-only deadline displays without timezone shift");

  // ---------- dashboard reflects changes immediately ----------
  await go("/");
  assert((await text()).includes(TAG + " MSc"), "dashboard lists new program deadline");
  ok("dashboard shows the new program deadline right after save");
  await go(progPath + "/edit");
  await fill({ name: TAG + " MSc Edited" });
  await submit();
  await until(async () => (await text()).includes(TAG + " MSc Edited"), "edited program");
  await go("/");
  assert((await text()).includes(TAG + " MSc Edited"));
  ok("edit persists and dashboard shows updated name (no 30s stale cache)");

  // ---------- scholarship quick add + search/filter ----------
  await go("/scholarships");
  await clickText("#main button", "Quick add");
  await until(() => evaluate(s, "!!document.querySelector('form[aria-label=\"Quick add scholarship\"]')"), "quick add form");
  await evaluate(s, "document.querySelector('form[aria-label=\"Quick add scholarship\"] button[type=submit]').click()");
  await until(async () => (await text()).includes("Scholarship name is required"), "quick add validation");
  await fill({ name: TAG + " Scholarship", country: "Testland", application_deadline: addDays(20) });
  await evaluate(s, "document.querySelector('form[aria-label=\"Quick add scholarship\"] button[type=submit]').click()");
  await until(() => evaluate(s, "/^\\/scholarships\\/[0-9a-f-]{36}$/.test(location.pathname)"), "scholarship detail");
  const schPath = await evaluate(s, "location.pathname");
  assert((await text()).includes(TAG + " Scholarship"));
  ok("scholarship quick add with name + country + deadline");
  await go("/");
  assert((await text()).includes(TAG + " Scholarship"));
  ok("dashboard shows the new scholarship deadline");

  // list search through the UI (debounced) and filters
  await go("/scholarships");
  await evaluate(s, `(() => { const el = document.querySelector('input[type=search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(TAG.toLowerCase())}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(() => evaluate(s, "location.search.includes('q=')"), "search updates URL");
  await until(async () => (await text()).includes(TAG + " Scholarship"), "search result");
  ok("search is case-insensitive, debounced and URL-driven");
  await go("/scholarships?q=" + encodeURIComponent(TAG) + "&deadline=past");
  assert((await text()).includes("No scholarships match your search"));
  await go("/scholarships?q=" + encodeURIComponent(TAG) + "&deadline=30&country=Testland");
  assert((await text()).includes(TAG + " Scholarship"));
  ok("filters combine (country + deadline) and empty results explain themselves");
  await go("/scholarships?q=%25_%2C()");
  assert(!(await text()).includes("Something went wrong"), "hostile search text is harmless");
  ok("hostile search characters do not break the query");
  await go("/programs?q=" + encodeURIComponent(TAG + " University"));
  assert((await text()).includes(TAG + " MSc Edited"));
  await go("/programs?q=" + encodeURIComponent(TAG) + "&country=Testland&degree=masters&university=" + uniId);
  assert((await text()).includes(TAG + " MSc Edited"));
  ok("programs: search by university name; university/country/degree filters combine");

  // ---------- desktop pass ----------
  await desktop(s);
  for (const path of ["/universities", "/programs", "/scholarships", uniPath, progPath, schPath, "/universities/new", "/programs/new", "/scholarships/new"]) {
    await go(path); await noOverflow("desktop " + path);
  }
  const side = await evaluate(s, "[...document.querySelectorAll('nav[aria-label=\"Main navigation\"] a')].map((a) => a.textContent.trim() + (a.getAttribute('aria-current') ? '*' : ''))");
  assert(side.includes("Programs"), "sidebar has Programs");
  await go("/programs");
  assert((await evaluate(s, "document.querySelector('nav[aria-label=\"Main navigation\"] a[aria-current=page]').textContent")).includes("Programs"));
  ok("1440px: no horizontal overflow on any Phase 5 page; sidebar active route correct");
  await phone(s);
  for (const path of ["/universities", "/programs", "/scholarships", uniPath, progPath, schPath, "/programs/new", "/scholarships/new"]) {
    await go(path); await noOverflow("mobile " + path);
  }
  ok("390px: no horizontal overflow on any Phase 5 page");

  // ---------- deletion safety + delete flow ----------
  await go(uniPath);
  await clickText("#main button", "Delete");
  await until(() => evaluate(s, "!!document.querySelector('[role=dialog]')"), "delete dialog");
  const blocked = await evaluate(s, "document.querySelector('[role=dialog]').innerText");
  assert(blocked.includes("still has 1 master's program") && !blocked.includes("Delete permanently"));
  ok("deleting a university with programs is blocked with an explanation");
  await evaluate(s, "[...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent === 'Close').click()");

  for (const [path, label, back] of [[schPath, "scholarship", "/scholarships"], [progPath, "program", "/programs"], [uniPath, "university", "/universities"]]) {
    await go(path);
    await clickText("#main button", "Delete");
    await until(() => evaluate(s, "!!document.querySelector('[role=dialog]')"), "dialog");
    await clickText("[role=dialog] button", "Delete permanently");
    await until(() => evaluate(s, `location.pathname === ${JSON.stringify(back)}`), "back to list after delete " + label);
    await go(path.split("/").slice(0, 2).join("/") + "?q=" + encodeURIComponent(TAG));
    assert(!(await text()).includes(TAG + (label === "scholarship" ? " Scholarship" : label === "program" ? " MSc" : " University")), label + " gone from list");
  }
  await go("/");
  assert(!(await text()).includes(TAG), "dashboard no longer shows deleted records");
  ok("delete confirmation flow works; records vanish from lists and dashboard");
  await go(uniPath, "document.body.innerText.length > 0");
  await until(() => evaluate(s, "/not found|could not be found|404/i.test(document.body.innerText)"), "deleted record -> not found");
  ok("deleted record URL shows not-found");

  const errs = b.errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  assert.equal(errs.length, 0, "console/runtime errors: " + errs.join(" | "));
  ok("no console errors or hydration errors during the run");
  console.log("\nALL PHASE 5 UI CHECKS PASSED");
} catch (e) {
  console.error("FAIL: " + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  await b.close();
  // Safety sweep for anything a failed run left behind (never touches non-test names).
  const { error } = await admin.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_OWNER_EMAIL, password: process.env.SUPABASE_TEST_OWNER_PASSWORD });
  if (!error) {
    const unis = (await admin.from("universities").select("id").ilike("name", "ZZ-P5-UI %")).data ?? [];
    await admin.from("scholarships").delete().ilike("name", "ZZ-P5-UI %");
    for (const u of unis) await admin.from("programs").delete().eq("university_id", u.id);
    await admin.from("universities").delete().ilike("name", "ZZ-P5-UI %");
    const left = (await admin.from("universities").select("id", { count: "exact", head: true }).ilike("name", "ZZ-P5-UI %")).count;
    console.log("CLEANUP: leftover UI test universities = " + left);
  }
}
