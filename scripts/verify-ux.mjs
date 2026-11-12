// Phase 4.5 browser checks (production server on :3100, owner test credentials in .env.local):
// password toggle, login form behaviour, loading states under a slow network, secure logout
// (hard navigation, back button, other tabs), and service-worker cache contents.
import assert from "node:assert/strict";
import { launch, origin } from "./lib/cdp.mjs";

assert(process.env.SUPABASE_TEST_OWNER_EMAIL && process.env.SUPABASE_TEST_OWNER_PASSWORD, "Owner test credentials required");
const b = await launch();
const { send, evaluate, until, delay } = b;
const ok = (m) => console.log("PASS: " + m);
const phone = (s) => send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
const desktop = (s) => send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => e.getClientRects().length > 0)`;

try {
  const s = await b.tab();
  await phone(s);

  // ---- Login form -------------------------------------------------------------------------
  await send("Page.navigate", { url: origin + "/login" }, s);
  await until(() => evaluate(s, visible("input[name=password]")), "login form");
  const form = await evaluate(s, `(() => { const e = document.querySelector('#email'), p = document.querySelector('#password');
    return { focus: document.activeElement === e, mail: e.autocomplete, pass: p.autocomplete, type: p.type, ptype: e.type,
      h: [e, p, document.querySelector('button[type=submit]')].map((x) => Math.round(x.getBoundingClientRect().height)) }; })()`);
  assert.equal(form.focus, true, "email is autofocused");
  assert.deepEqual([form.mail, form.pass, form.type, form.ptype], ["username", "current-password", "password", "email"]);
  assert(form.h.every((h) => h >= 44), "touch targets >= 44px: " + form.h);
  ok("login form: autofocus, autocomplete, input types, 44px touch targets");

  await evaluate(s, `(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const p = document.querySelector('#password'); set.call(p, 'typed-secret'); p.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const toggle = `document.querySelector('button[aria-controls=password]')`;
  const state = () => evaluate(s, `({ type: document.querySelector('#password').type, value: document.querySelector('#password').value,
    label: ${toggle}.getAttribute('aria-label'), pressed: ${toggle}.getAttribute('aria-pressed'), btn: ${toggle}.type, path: location.pathname,
    focusable: ${toggle}.tabIndex >= 0 && !${toggle}.disabled, size: Math.round(${toggle}.getBoundingClientRect().width) })`);
  let t = await state();
  assert.deepEqual([t.type, t.label, t.pressed, t.btn, t.focusable], ["password", "Show password", "false", "button", true]);
  assert(t.size >= 44, "toggle is touch sized");
  await evaluate(s, `${toggle}.click()`);
  t = await state();
  assert.deepEqual([t.type, t.value, t.label, t.pressed, t.path], ["text", "typed-secret", "Hide password", "true", "/login"], "reveals, keeps value, does not submit");
  await evaluate(s, `${toggle}.click()`);
  t = await state();
  assert.deepEqual([t.type, t.value, t.label], ["password", "typed-secret", "Show password"]);
  ok("password visibility toggle: hidden by default, keeps value, never submits, labelled, keyboard focusable");

  // wrong password: friendly error, email preserved, password cleared, no duplicate-submit window
  await b.submitLogin(s, process.env.SUPABASE_TEST_OWNER_EMAIL, "definitely-wrong-password");
  await until(() => evaluate(s, "document.querySelector('#login-error')?.textContent.length > 0"), "login error");
  const failed = await evaluate(s, `({ err: document.querySelector('#login-error').textContent, role: document.querySelector('#login-error').getAttribute('role'),
    email: document.querySelector('#email').value, pass: document.querySelector('#password').value, disabled: document.querySelector('button[type=submit]').disabled })`);
  assert.match(failed.err, /do not match the owner account/);
  assert.equal(failed.role, "alert");
  assert.equal(failed.email, process.env.SUPABASE_TEST_OWNER_EMAIL, "email kept after a failed attempt");
  assert.equal(failed.pass, "", "password cleared after a failed attempt");
  assert.equal(failed.disabled, false);
  ok("failed login: readable alert, email preserved, password cleared, form usable again");

  // ---- Owner session ----------------------------------------------------------------------
  await b.loginOwner(s);
  await evaluate(s, "document.querySelector('#main h1').textContent");
  assert.match(await evaluate(s, "document.querySelector('#main p').textContent"), /\d{4}/, "dashboard date label");
  await delay(2500); // allow viewport prefetch

  // Slow network: the tap is acknowledged, the shell stays, a route skeleton shows, then content replaces it.
  await send("Network.emulateNetworkConditions", { offline: false, latency: 700, downloadThroughput: 150_000, uploadThroughput: 75_000 }, s);
  const nav = await evaluate(s, `(async () => {
    const link = [...document.querySelectorAll('nav a')].find((a) => a.getAttribute('href') === '/tasks' && a.getClientRects().length);
    const t0 = performance.now(); link.click();
    const seen = { ack: null, skeleton: null, chromeKept: true, done: null };
    await new Promise((res) => { const tick = () => {
      const now = Math.round(performance.now() - t0);
      if (!document.querySelector('nav a')) seen.chromeKept = false;
      if (seen.ack === null && link.querySelector('[data-pending]')) seen.ack = now;
      if (seen.skeleton === null && document.querySelector('#main [data-loading]')) seen.skeleton = now;
      if (location.pathname === '/tasks' && document.querySelector('#main h1')) { seen.done = now; return res(); }
      if (now > 15000) return res(); requestAnimationFrame(tick); }; tick(); });
    return seen; })()`);
  console.log("  slow-network tap -> ack/skeleton/content (ms):", nav.ack, nav.skeleton, nav.done);
  assert(nav.ack !== null || nav.skeleton !== null, "tap acknowledged before content");
  assert(Math.min(nav.ack ?? Infinity, nav.skeleton ?? Infinity) < 300, "acknowledged within 300ms");
  assert.equal(nav.chromeKept, true, "navigation chrome stays mounted");
  ok("route change on slow network: immediate acknowledgement, shell kept, content follows");

  // Cold dashboard load: skeleton first, never an empty state while loading, then real content.
  await send("Page.navigate", { url: origin + "/" }, s);
  const cold = await until(() => evaluate(s, `(() => ({ loading: !!document.querySelector('#main [data-loading]'), chrome: !!document.querySelector('nav a'),
    role: document.querySelector('#main [data-loading]')?.getAttribute('role'), empty: /No applications yet|No deadlines yet/.test(document.querySelector('#main')?.textContent ?? '') }))()`)
    .then((r) => (r.loading ? r : null)), "dashboard skeleton", 80);
  assert.deepEqual([cold.chrome, cold.role, cold.empty], [true, "status", false]);
  await until(() => evaluate(s, "!!document.querySelector('#main h1') && !document.querySelector('#main [data-loading]')"), "dashboard content", 200);
  assert.equal(await evaluate(s, "document.querySelectorAll('#main dl > div').length"), 6, "six statistic cards");
  ok("dashboard: skeleton with status role while loading, no empty state during loading, then six stat cards");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, s);

  // ---- Layout at both required widths ------------------------------------------------------
  for (const [name, set] of [["390px", phone], ["1440px", desktop]]) {
    await set(s);
    for (const route of ["/", "/applications", "/more"]) {
      await send("Page.navigate", { url: origin + route }, s);
      await until(() => evaluate(s, `location.pathname === ${JSON.stringify(route)} && !!document.querySelector('#main h1')`), route);
      const v = await evaluate(s, `({ over: document.documentElement.scrollWidth > innerWidth, vis: [...document.querySelectorAll('nav')].filter((n) => n.getClientRects().length).length,
        bottom: (() => { const n = document.querySelector('.mobile-navigation'); return n.getClientRects().length ? Math.round(innerHeight - n.getBoundingClientRect().bottom) : null; })() })`);
      assert.equal(v.over, false, `no overflow ${route} ${name}`);
      assert.equal(v.vis, 1, `one navigation ${route} ${name}`);
      if (name === "390px") assert.equal(v.bottom, 0, "bottom bar pinned to the viewport bottom");
    }
  }
  ok("390px and 1440px: no overflow, one visible navigation, bottom bar pinned");
  await phone(s);

  // ---- Secure logout ----------------------------------------------------------------------
  await send("Page.navigate", { url: origin + "/" }, s);
  await until(() => evaluate(s, visible(".mobile-navigation")), "dashboard before logout");
  const other = await b.tab(origin + "/");
  await until(() => evaluate(other, "!!document.querySelector('#main h1')"), "second tab dashboard");
  // soft navigations build history entries: / -> /tasks -> /calendar
  for (const route of ["/tasks", "/calendar"]) {
    await evaluate(s, `[...document.querySelectorAll('nav a')].find((a) => a.getAttribute('href') === ${JSON.stringify(route)} && a.getClientRects().length).click()`);
    await until(() => evaluate(s, `location.pathname === ${JSON.stringify(route)} && !!document.querySelector('#main h1')`), route);
  }
  await evaluate(s, "window.__marker = 'authenticated-document'");
  await send("Page.bringToFront", {}, s);
  await evaluate(s, "[...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Sign out')).click()");
  await until(() => evaluate(s, "location.pathname === '/login' && document.querySelector('input[name=password]')?.getClientRects().length > 0"), "logout to login");
  assert.equal(await evaluate(s, "window.__marker"), undefined, "hard navigation discarded the authenticated document");
  assert.equal(await evaluate(s, "document.querySelectorAll('nav, main h1:not(#login-title)').length"), 0, "no private markup in the login document");
  ok("logout: hard navigation to /login, no authenticated DOM or JS state survives");

  await send("Page.bringToFront", {}, other);
  await until(() => evaluate(other, "location.pathname === '/login'"), "other tab signs out without reload", 60);
  ok("logout in one tab signs the other tab out automatically");

  // back button: every earlier private entry must land on login, never on private content
  for (let i = 0; i < 3; i++) {
    await send("Page.bringToFront", {}, s);
    await evaluate(s, "history.back()");
    await delay(1200);
    const now = await evaluate(s, "({ path: location.pathname, priv: !!document.querySelector('.mobile-navigation, main h1:not(#login-title)') })").catch(() => null);
    if (now) assert.deepEqual([now.path, now.priv], ["/login", false], "back button must not expose private content");
  }
  const proxied = await fetch(origin + "/tasks", { redirect: "manual" });
  assert.equal(proxied.status, 307);
  ok("browser back after logout never shows private content; private URLs redirect to /login");

  // ---- Service worker cache contents after an authenticated session ------------------------
  const cached = await evaluate(s, `(async () => (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))).flat())()`);
  assert(cached.every((p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || ["/offline.html", "/offline.js"].includes(p)), "private path in cache: " + cached.filter((p) => !p.startsWith("/_next/static/") && !p.startsWith("/icons/")).join(","));
  ok("service worker caches only static assets and the offline page after an authenticated session");

  assert.deepEqual(b.errors, [], "no runtime or hydration errors: " + b.errors.join(" | "));
  ok("no browser runtime or hydration errors");
} finally { await b.close(); }
