// Production browser checks using Chrome's DevTools protocol; no test dependency.
// Start npm run start -- -p 3100 first. Do not run against a shared deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const origin = process.env.PWA_TEST_ORIGIN || "http://localhost:3100";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Only run against a local server");
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = await mkdtemp(path.join(tmpdir(), "scholartrack-pwa-"));
const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--remote-debugging-port=0", "--user-data-dir=" + profile],
  { windowsHide: true, stdio: "ignore" });
let launchError;
browser.on("error", (error) => { launchError = error; });
let socket;
const workerPath = new URL("../public/sw.js", import.meta.url);
const originalWorker = await readFile(workerPath, "utf8");
const errors = [];
const pending = new Map();
let sequence = 0;
let stage = "start";
async function until(check, label) {
  stage = label;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    try { const result = await check(); if (result) return result; } catch { /* page may be navigating */ }
    await delay(100);
  }
  throw new Error("Timed out: " + label);
}
function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("DevTools timed out: " + method));
    }, 15000);
    pending.set(id, {
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(session, expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function tab(authenticated = false) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Page.navigate", { url: origin }, sessionId);
  await until(() => evaluate(sessionId, authenticated
    ? "location.pathname === '/' && !!document.querySelector('.mobile-navigation') && !!document.querySelector('#main h1') && !document.querySelector('[data-loading]')"
    : "document.querySelector('h1')?.textContent === 'Welcome back' && document.querySelector('input[autocomplete=\"username\"]')?.getClientRects().length > 0"), authenticated ? "authenticated workspace" : "visible login form");
  return sessionId;
}
try {
  const protectedResponse = await fetch(origin + "/", { redirect: "manual" });
  assert.equal(protectedResponse.status, 307);
  assert.equal(new URL(protectedResponse.headers.get("location"), origin).pathname, "/login");
  assert.match(protectedResponse.headers.get("cache-control"), /private, no-store/);
  const manifestResponse = await fetch(origin + "/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "Scholarship Tracker");
  assert.equal(manifest.orientation, "any");
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const response = await fetch(origin + icon.src);
    assert.equal(response.status, 200);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16) + "x" + data.readUInt32BE(20), icon.sizes);
  }
  const swResponse = await fetch(origin + "/sw.js");
  assert.equal(swResponse.status, 200);
  assert.match(swResponse.headers.get("cache-control"), /no-store/);
  const portInfo = await until(async () => {
    const info = await readFile(path.join(profile, "DevToolsActivePort"), "utf8");
    return info.split("\n");
  }, "Chrome remote debugging");
  socket = new WebSocket("ws://127.0.0.1:" + portInfo[0] + portInfo[1]);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(String(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text).slice(0, 300));
      send("Runtime.evaluate", { expression: "location.pathname" }, message.sessionId)
        .then((r) => console.log("  runtime error on page:", r.result.value, "| during step:", stage)).catch(() => {});
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(message.params.args.map((item) => item.value || item.description).join(" "));
    }
  });

  const primary = await tab();
  await evaluate(primary, "navigator.serviceWorker.ready.then(r => r.scope)");
  await send("Page.reload", {}, primary);
  await until(() => evaluate(primary, "!!navigator.serviceWorker.controller && document.querySelector('input[autocomplete=\"username\"]')?.getClientRects().length > 0"), "worker control and visible streamed login form");
  assert.equal(await evaluate(primary, "document.querySelector('link[rel=manifest]').getAttribute('href')"), "/manifest.webmanifest");
  assert.equal(await evaluate(primary, "document.querySelector('meta[name=mobile-web-app-capable]').content"), "yes");
  assert.equal(await evaluate(primary, "document.querySelector('meta[name=apple-mobile-web-app-title]').content"), "ScholarTrack");

  for (const width of [320, 390, 844, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, primary);
    const dimensions = await evaluate(primary, `({
      width: window.innerWidth, scroll: document.documentElement.scrollWidth,
      login: !!document.querySelector('input[autocomplete="username"]'),
      privateNavigation: !!document.querySelector(".mobile-navigation, .app-shell > aside")
    })`);
    assert(dimensions.scroll <= dimensions.width, "Horizontal overflow at " + width);
    assert.equal(dimensions.login, true);
    assert.equal(dimensions.privateNavigation, false);
    if (width === 390 || width === 1440) {
      await evaluate(primary, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const screenshot = await send("Page.captureScreenshot", { format: "png" }, primary);
      await writeFile(new URL("../.next/pwa-" + width + ".png", import.meta.url), Buffer.from(screenshot.data, "base64"));
    }
  }
  console.log("PASS: anonymous redirect, manifest, icons, headers, mobile and desktop login layouts");

  // DevTools page emulation alone does not disable a worker's own network.
  const { targetInfos } = await send("Target.getTargets");
  const workerTarget = targetInfos.find((item) => item.type === "service_worker" && item.url === origin + "/sw.js");
  assert(workerTarget, "Installed service worker target");
  const { sessionId: workerSession } = await send("Target.attachToTarget", { targetId: workerTarget.targetId, flatten: true });
  await send("Network.enable", {}, workerSession);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, workerSession);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, primary);
  await send("Page.navigate", { url: origin + "/login?offline-check=1" }, primary);
  await until(() => evaluate(primary, "document.querySelector('h1')?.textContent === \"You're offline\""), "offline fallback");
  await evaluate(primary, "document.getElementById('retry').click()");
  await until(() => evaluate(primary, "document.querySelector('h1')?.textContent === \"You're offline\""), "retry while offline");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, workerSession);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, primary);
  await evaluate(primary, "document.getElementById('retry').click()");
  await until(() => evaluate(primary, "document.querySelector('h1')?.textContent === 'Welcome back'"), "online retry");
  const cachePaths = await evaluate(primary, `(async () => {
    await fetch(document.querySelector('script[src^="/_next/static/"]').getAttribute("src"));
    await fetch("/api/pwa-private-check", { headers: { authorization: "Bearer test-only" } });
    await fetch("/?pwa-private-check=1");
    const names = await caches.keys();
    return (await Promise.all(names.map(async n => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)))).flat();
  })()`);
  assert(cachePaths.includes("/offline.html"));
  assert(cachePaths.some((p) => p.startsWith("/_next/static/")), "Static asset caching");
  assert(cachePaths.every((p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || p === "/offline.html" || p === "/offline.js"), "Unexpected data in cache");
  console.log("PASS: offline navigation, offline retry, recovery, private/API/document cache exclusion");

  const secondary = await tab();
  await evaluate(primary, "window.__pwaTestMarker = 'unsaved-work'");
  await evaluate(secondary, "window.__pwaTestMarker = 'other-tab-work'");
  await writeFile(workerPath, originalWorker.replace(/const VERSION = "[^"]+";/, 'const VERSION = "browser-test-' + Date.now() + '";'));
  await evaluate(primary, "navigator.serviceWorker.getRegistration().then(r => r.update())");
  await until(() => evaluate(primary, "!!document.querySelector('[aria-label=\"Application update\"] button')"), "update prompt");
  assert.equal(await evaluate(primary, "window.__pwaTestMarker"), "unsaved-work");
  await evaluate(primary, "document.querySelector('[aria-label=\"Application update\"] button').click()");
  await until(() => evaluate(primary, "window.__pwaTestMarker === undefined && !!document.querySelector('h1')"), "accepted update reload");
  assert.equal(await evaluate(secondary, "window.__pwaTestMarker"), "other-tab-work");
  await until(() => evaluate(secondary, "!!document.querySelector('[aria-label=\"Application update\"] button')"), "other-tab refresh notification");
  assert.deepEqual(errors, []);
  console.log("PASS: new version detection, consent before reload, other-tab work preserved, no browser runtime or hydration errors");

  if (process.env.SUPABASE_TEST_OWNER_EMAIL && process.env.SUPABASE_TEST_OWNER_PASSWORD) {
    await send("Page.bringToFront", {}, primary);
    await send("Page.navigate", { url: origin + "/login" }, primary);
    await until(() => evaluate(primary, "document.querySelector('input[name=password]')?.getClientRects().length > 0"), "login form after update");
    // Arguments travel separately from source code; errors never include values.
    async function submitLogin(email, password) {
      const document = await send("Runtime.evaluate", { expression: "document", returnByValue: false }, primary);
      const result = await send("Runtime.callFunctionOn", {
        objectId: document.result.objectId,
        functionDeclaration: `function(email, password) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const [id, value] of [['email', email], ['password', password]]) {
            const input = this.querySelector('input[name=' + id + ']');
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          this.querySelector('form').requestSubmit();
        }`,
        arguments: [{ value: email }, { value: password }], returnByValue: true,
      }, primary);
      assert(!result.exceptionDetails, "Login form submission failed");
    }
    await submitLogin(process.env.SUPABASE_TEST_OWNER_EMAIL, process.env.SUPABASE_TEST_OWNER_PASSWORD);
    const workspace = "location.pathname === '/' && !!document.querySelector('.mobile-navigation') && !!document.querySelector('#main h1') && !document.querySelector('[data-loading]')";
    await until(() => evaluate(primary, workspace), "live owner browser login");
    await send("Page.reload", {}, primary);
    await until(() => evaluate(primary, workspace), "owner session after reload");
    // Phase 4: every route renders, highlights itself, and never overflows horizontally.
    for (const width of [390, 1440]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, primary);
      for (const route of ["/", "/universities", "/scholarships", "/applications", "/calendar", "/tasks", "/documents", "/settings", "/more"]) {
        await send("Page.navigate", { url: origin + route }, primary);
        const ready = `location.pathname === ${JSON.stringify(route)} && !!document.querySelector('main h1')`;
        await until(() => evaluate(primary, ready), `authenticated route ${route} at ${width}`);
        const view = await evaluate(primary, `({
          over: document.documentElement.scrollWidth > window.innerWidth,
          nav: [...document.querySelectorAll('nav')].filter((n) => n.getClientRects().length).length,
          current: [...document.querySelectorAll('nav a[aria-current=page]')].filter((a) => a.getClientRects().length).length })`);
        assert.equal(view.over, false, `Horizontal overflow on ${route} at ${width}`);
        assert.equal(view.nav, 1, `One visible navigation on ${route} at ${width}`);
        if (width < 768 || route !== "/more") assert.equal(view.current, 1, `Active highlight on ${route} at ${width}`);
      }
    }
    await send("Page.navigate", { url: origin + "/" }, primary);
    await until(() => evaluate(primary, workspace), "dashboard after route sweep");
    const restoredTab = await tab(true);
    await send("Page.bringToFront", {}, primary);
    const { cookies } = await send("Storage.getCookies");
    assert(cookies.some((cookie) => /^sb-.*-auth-token/.test(cookie.name) && cookie.expires > Date.now() / 1000), "Persistent auth cookie expiry");
    await send("Page.navigate", { url: origin + "/login" }, primary);
    await until(() => evaluate(primary, workspace), "authenticated login-page redirect");
    const authenticatedCaches = await evaluate(primary, `(async () => (await Promise.all((await caches.keys()).map(async n =>
      (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)))).flat())()`);
    assert(authenticatedCaches.every((p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || ["/offline.html", "/offline.js"].includes(p)), "Private workspace entered service worker cache");
    await evaluate(primary, "[...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Sign out')).click()");
    const loginVisible = "location.pathname === '/login' && document.querySelector('input[name=password]')?.getClientRects().length > 0";
    await until(() => evaluate(primary, loginVisible), "browser logout");
    await send("Page.bringToFront", {}, restoredTab);
    // The other tab signs itself out through SessionGuard; navigating it too would race that redirect.
    await until(() => evaluate(restoredTab, loginVisible), "other tab denied after logout");
    console.log("PASS: live owner UI login, reload/new-tab persistence, persistent cookies, login redirect, logout and private cache exclusion");
    if (process.env.SUPABASE_TEST_NON_OWNER_EMAIL && process.env.SUPABASE_TEST_NON_OWNER_PASSWORD) {
      await send("Page.bringToFront", {}, primary);
      await submitLogin(process.env.SUPABASE_TEST_NON_OWNER_EMAIL, process.env.SUPABASE_TEST_NON_OWNER_PASSWORD);
      await until(() => evaluate(primary, "location.pathname === '/login' && document.querySelector('#login-error')?.textContent.includes('do not match the owner account')"), "non-owner browser denial");
      assert.equal(await evaluate(primary, "[...document.querySelectorAll('.mobile-navigation')].some(e => e.getClientRects().length > 0)"), false);
      console.log("PASS: real non-owner UI login denied");
    } else console.log("NOT RUN: real non-owner UI login; separate test credentials unavailable");
    assert.deepEqual(errors, []);
  } else console.log("NOT RUN: authenticated browser checks; owner test credentials unavailable");
} finally {
  await writeFile(workerPath, originalWorker);
  if (socket?.readyState === WebSocket.OPEN) {
    await send("Browser.close").catch(() => {});
    socket.close();
  }
  browser.kill();
}
