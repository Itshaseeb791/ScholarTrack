import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };

function load(file, mocks = {}, env = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, URL, process: { env },
    require: (name) => name === "server-only" ? {} : mocks[name] ?? require(name),
  }, { filename: file });
  return exports;
}

function authClient(user = owner, databaseOwner = true) {
  let signedOut = false;
  return {
    auth: {
      getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }),
      signInWithPassword: async () => ({ data: { user: { id: user }, session: {} }, error: null }),
      signOut: async () => { signedOut = true; return { error: null }; },
    },
    rpc: async () => ({ data: databaseOwner, error: null }),
    get signedOut() { return signedOut; },
  };
}

test("owner configuration rejects missing/malformed IDs and normalizes UUIDs", () => {
  for (const value of [undefined, "", "any-user", "*"]) {
    assert.equal(load("lib/auth/owner.ts", {}, { SUPABASE_OWNER_ID: value }).getOwnerId(), null);
  }
  assert.equal(load("lib/auth/owner.ts", {}, { SUPABASE_OWNER_ID: owner }).getOwnerId(), owner);
});

test("private data boundary requires a verified user and matching database owner", async () => {
  for (const [id, dbOwner, allowed] of [[owner, true, true], [owner, false, false], [other, true, false], [null, true, false]]) {
    const client = authClient(id, dbOwner);
    const session = load("lib/auth/session.ts", {
      react: { cache: (fn) => fn }, "next/navigation": { redirect },
      "next/server": { connection: async () => {} },
      "@/lib/supabase/server": { createClient: async () => client },
      "./owner": { getOwnerId: () => owner },
    });
    assert.equal(Boolean(await session.getOwnerSession()), allowed);
    if (allowed) assert.equal((await session.requireOwner()).user.id, owner);
    else await assert.rejects(session.requireOwner(), /REDIRECT:\/login/);
  }
});

test("login validates input and rejects other users and mismatched database owner", async () => {
  for (const [id, dbOwner, allowed] of [[owner, true, true], [other, true, false], [owner, false, false]]) {
    const client = authClient(id, dbOwner);
    const actions = load("app/login/actions.ts", {
      "next/navigation": { redirect },
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/auth/owner": { getOwnerId: () => owner },
    });
    const invalid = await actions.login({}, new Map([["email", "bad"], ["password", ""]]));
    assert.ok(invalid.error);
    const attempt = actions.login({}, new Map([["email", "owner@example.com"], ["password", "test-only-password"]]));
    if (allowed) await assert.rejects(attempt, /REDIRECT:\/$/);
    else { assert.ok((await attempt).error); assert.equal(client.signedOut, true); }
  }
});

test("sign-out route ends the session and rejects cross-origin requests", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  for (const [origin, status, signs] of [["http://localhost", 200, true], ["https://evil.example", 403, false], [null, 403, false]]) {
    const client = authClient();
    const route = load("app/auth/signout/route.ts", { "next/server": { NextResponse }, "@/lib/supabase/server": { createClient: async () => client } });
    const headers = { host: "localhost", ...(origin ? { origin } : {}) };
    const response = await route.POST(new NextRequest("http://localhost/auth/signout", { method: "POST", headers }));
    assert.equal(response.status, status);
    assert.equal(client.signedOut, signs);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("proxy redirects preserve refreshed cookies and prevent response caching", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  for (const [id, path, expected, target = "/login"] of [[other, "/", 307], [null, "/tasks", 307], [owner, "/", 200], [null, "/login", 200], [owner, "/login", 307, "/"], [other, "/login", 200]]) {
    const proxy = load("proxy.ts", {
      "@/lib/supabase/config": { getSupabaseConfig: () => ({ url: "https://example.supabase.co", key: "test-key" }) },
      "@/lib/auth/owner": { getOwnerId: () => owner },
      "@supabase/ssr": { createServerClient: (_url, _key, options) => ({ rpc: async () => ({ data: id === owner, error: null }), auth: {
        getUser: async () => {
          options.cookies.setAll([{ name: "refreshed", value: "test-cookie", options: { path: "/", httpOnly: true } }]);
          return { data: { user: id ? { id } : null }, error: null };
        },
        // (rpc is a sibling of auth on the real client)
      } }) },
      "next/server": { NextResponse },
    });
    const response = await proxy.proxy(new NextRequest(`http://localhost${path}`));
    assert.equal(response.status, expected);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.equal(response.cookies.get("refreshed").value, "test-cookie");
    if (expected === 307) assert.equal(response.headers.get("location"), "http://localhost" + target);
  }
});

test("proxy fails closed without owner configuration", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const proxy = load("proxy.ts", {
    "@/lib/auth/owner": { getOwnerId: () => null },
    "@/lib/supabase/config": {}, "next/server": { NextResponse },
  });
  assert.equal((await proxy.proxy(new NextRequest("http://localhost/"))).status, 307);
  assert.equal((await proxy.proxy(new NextRequest("http://localhost/login"))).status, 200);
});
