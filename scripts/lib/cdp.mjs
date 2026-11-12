// Minimal headless-Chrome DevTools client shared by newer browser scripts. Local origins only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
export const origin = process.env.PWA_TEST_ORIGIN || "http://localhost:3100";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Only run against a local server");

export async function launch() {
  const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const profile = await mkdtemp(path.join(tmpdir(), "scholartrack-cdp-"));
  const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--remote-debugging-port=0", "--user-data-dir=" + profile], { windowsHide: true, stdio: "ignore" });
  const pending = new Map();
  const errors = [];
  let sequence = 0, socket;
  const until = async (check, label, tries = 100) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await check(); if (r) return r; } catch { /* navigating */ }
      await delay(100);
    }
    throw new Error("Timed out: " + label);
  };
  const info = await until(async () => (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n"), "Chrome debugging port");
  socket = new WebSocket("ws://127.0.0.1:" + info[0] + info[1]);
  await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) { const cb = pending.get(m.id); pending.delete(m.id); if (m.error) cb.reject(new Error(JSON.stringify(m.error))); else cb.resolve(m.result); }
    else if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value || a.description).join(" "));
  });
  const send = (method, params = {}, sessionId) => {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("DevTools timed out: " + method)); }, 30000);
      pending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  const evaluate = async (session, expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const tab = async (url = "about:blank") => {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    for (const d of ["Page", "Runtime", "Network"]) await send(d + ".enable", {}, sessionId);
    if (url !== "about:blank") await send("Page.navigate", { url }, sessionId);
    return sessionId;
  };
  // Credentials travel as call arguments, never inside source text or logs.
  const submitLogin = async (session, email, password) => {
    const doc = await send("Runtime.evaluate", { expression: "document", returnByValue: false }, session);
    const r = await send("Runtime.callFunctionOn", {
      objectId: doc.result.objectId,
      functionDeclaration: `function(email, password) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [n, v] of [['email', email], ['password', password]]) {
          const i = this.querySelector('input[name=' + n + ']'); set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.querySelector('form').requestSubmit();
      }`, arguments: [{ value: email }, { value: password }], returnByValue: true,
    }, session);
    assert(!r.exceptionDetails, "Login form submission failed");
  };
  const loginOwner = async (session) => {
    await send("Page.navigate", { url: origin + "/login" }, session);
    await until(() => evaluate(session, "document.querySelector('input[name=password]')?.getClientRects().length > 0"), "login form");
    await submitLogin(session, process.env.SUPABASE_TEST_OWNER_EMAIL, process.env.SUPABASE_TEST_OWNER_PASSWORD);
    await until(() => evaluate(session, "location.pathname === '/' && !!document.querySelector('#main h1')"), "owner dashboard");
  };
  const close = async () => {
    await send("Browser.close").catch(() => {}); socket.close(); browser.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { send, evaluate, until, tab, submitLogin, loginOwner, close, errors, delay };
}
