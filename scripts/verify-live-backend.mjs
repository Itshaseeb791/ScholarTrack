// Live security checks. Credentials stay in memory; temporary document metadata
// and objects use a fresh UUID and are removed in finally. No application fixtures.
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_OWNER_ID",
  "SUPABASE_TEST_OWNER_EMAIL", "SUPABASE_TEST_OWNER_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("BLOCKED: missing saved environment entries: " + missing.join(", "));
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ownerId = process.env.SUPABASE_OWNER_ID.toLowerCase();
const hasOtherCredentials = Boolean(process.env.SUPABASE_TEST_NON_OWNER_EMAIL && process.env.SUPABASE_TEST_NON_OWNER_PASSWORD);
const makeClient = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
});
const owner = makeClient();
const other = makeClient();
const anonymous = makeClient();
const bucket = "scholarship-documents";
const documentId = randomUUID();
const filename = "phase3-verification.txt";
const objectPath = `${ownerId}/${documentId}/${filename}`;
const payload = new TextEncoder().encode("Temporary Phase 3 private storage verification.\n");
const additionalPaths = new Set();
let objectCreated = false;
let metadataCreated = false;
let label = "initialization";
let incomplete = false;
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function passed(message) { console.log("PASS: " + message); }

try {
  label = "public signup disabled";
  const response = await fetch(`${url}/auth/v1/settings?verification=${Date.now()}`, {
    headers: { apikey: key, "Cache-Control": "no-cache" }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (response.ok && (await response.json()).disable_signup === true) passed(label);
  else {
    console.error("FAIL: public signup remains enabled or its setting could not be verified.");
    process.exitCode = 1;
  }

  label = "owner password login";
  const login = await owner.auth.signInWithPassword({
    email: process.env.SUPABASE_TEST_OWNER_EMAIL, password: process.env.SUPABASE_TEST_OWNER_PASSWORD,
  });
  if (login.error) {
    const code = /^[a-z_]+$/.test(login.error.code || "") ? login.error.code : "unavailable";
    console.error(`Auth error code: ${code}; HTTP status: ${Number(login.error.status) || 0}`);
  }
  check(!login.error && login.data.user, label);
  label = "authenticated account matches SUPABASE_OWNER_ID";
  check(login.data.user.id === ownerId, label);
  label = "server-verified owner identity";
  const user = await owner.auth.getUser();
  check(!user.error && user.data.user?.id === ownerId, label);
  passed("owner password login, configured UUID match, and server-verified identity");
  label = "session refresh and restoration in a new client";
  const refresh = await owner.auth.refreshSession();
  check(!refresh.error && refresh.data.session, label);
  const restored = makeClient();
  const restore = await restored.auth.setSession({
    access_token: refresh.data.session.access_token, refresh_token: refresh.data.session.refresh_token,
  });
  check(!restore.error && (await restored.auth.getUser()).data.user?.id === ownerId, label);
  passed(label);

  label = "database owner singleton recognizes the configured owner";
  const authorization = await owner.rpc("is_app_owner");
  console.log(`Database owner RPC succeeded: ${!authorization.error}; recognizes owner: ${authorization.data === true}`);
  check(!authorization.error && authorization.data === true, label);
  passed(label);

  label = "real authenticated non-owner identity is rejected by owner authorization";
  let nonOwnerId = randomUUID();
  if (hasOtherCredentials) {
    const otherLogin = await other.auth.signInWithPassword({
      email: process.env.SUPABASE_TEST_NON_OWNER_EMAIL, password: process.env.SUPABASE_TEST_NON_OWNER_PASSWORD,
    });
    check(!otherLogin.error && otherLogin.data.user && otherLogin.data.user.id !== ownerId, label);
    nonOwnerId = otherLogin.data.user.id;
    const otherAuthorization = await other.rpc("is_app_owner");
    check(!otherAuthorization.error && otherAuthorization.data === false, label);
    passed(label);
  } else {
    console.log("BLOCKED: real non-owner checks require SUPABASE_TEST_NON_OWNER_EMAIL and SUPABASE_TEST_NON_OWNER_PASSWORD.");
    process.exitCode = 1;
  }

  label = "owner table access and non-owner read denial";
  for (const table of ["universities", "programs", "scholarships", "applications", "application_scholarships",
    "tasks", "documents", "application_documents", "events", "reminders"]) {
    const own = await owner.from(table).select("user_id").limit(1);
    check(!own.error && own.data.every((row) => row.user_id === ownerId), "owner table query: " + table);
    if (hasOtherCredentials) {
      const foreign = await other.from(table).select("user_id").limit(1);
      check(!foreign.error && foreign.data.length === 0, "non-owner table query: " + table);
    }
    const anon = await anonymous.from(table).select("user_id").limit(1);
    check(Boolean(anon.error) && [401, 403].includes(anon.status), "anonymous table query: " + table);
  }
  passed("owner reads and anonymous denial on all ten tables" + (hasOtherCredentials ? "; real non-owner sees no rows" : ""));

  label = "owner private Storage upload and document metadata insert";
  const upload = await owner.storage.from(bucket).upload(objectPath, payload, { contentType: "text/plain", upsert: false });
  objectCreated = !upload.error;
  check(objectCreated, label);
  const metadata = await owner.from("documents").insert({
    id: documentId, user_id: ownerId, file_name: filename,
    storage_path: objectPath, mime_type: "text/plain", file_size: payload.byteLength,
  });
  metadataCreated = !metadata.error;
  check(metadataCreated, label);
  passed(label);

  label = "owner download and short-lived signed download";
  const download = await owner.storage.from(bucket).download(objectPath);
  check(!download.error && await download.data.text() === new TextDecoder().decode(payload), label);
  const signed = await owner.storage.from(bucket).createSignedUrl(objectPath, 30);
  check(!signed.error && signed.data?.signedUrl, label);
  const signedResponse = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(15000) });
  check(signedResponse.ok && await signedResponse.text() === new TextDecoder().decode(payload), label);
  passed(label);

  label = "anonymous/public and non-owner access to an existing private object denied";
  check(Boolean((await anonymous.storage.from(bucket).download(objectPath)).error), label);
  if (hasOtherCredentials) {
    check(Boolean((await other.storage.from(bucket).download(objectPath)).error), label);
    check(Boolean((await other.storage.from(bucket).createSignedUrl(objectPath, 30)).error), label);
  }
  const publicResponse = await fetch(`${url}/storage/v1/object/public/${bucket}/${objectPath}`, { signal: AbortSignal.timeout(15000) });
  check(!publicResponse.ok, label);
  if (hasOtherCredentials) {
    const hiddenMetadata = await other.from("documents").select("id").eq("id", documentId);
    check(!hiddenMetadata.error && hiddenMetadata.data.length === 0, label);
  }
  passed("anonymous and public object download denied" + (hasOtherCredentials ? "; non-owner download/signing/metadata denied" : ""));

  label = "non-owner metadata writes and ownership impersonation denied";
  if (hasOtherCredentials) {
  const update = await other.from("documents").update({ file_name: "forbidden.txt" }).eq("id", documentId).select("id");
  check(!update.error && update.data.length === 0, label);
  const remove = await other.from("documents").delete().eq("id", documentId).select("id");
  check(!remove.error && remove.data.length === 0, label);
  const transfer = await owner.from("documents").update({ user_id: nonOwnerId }).eq("id", documentId);
  check(transfer.error?.code === "42501", label);
  const impersonate = await other.from("documents").insert({
    id: documentId, user_id: ownerId, file_name: filename,
    storage_path: objectPath, mime_type: "text/plain", file_size: payload.byteLength,
  });
  check(impersonate.error?.code === "42501", label);
  passed(label);
  }

  label = "Storage upload path ownership and non-owner deletion guards";
  const badPaths = [
    [owner, `${nonOwnerId}/${documentId}/${filename}`],
    [anonymous, `${ownerId}/${randomUUID()}/${filename}`],
  ];
  if (hasOtherCredentials) badPaths.push(
    [other, `${nonOwnerId}/${documentId}/${filename}`],
    [other, `${ownerId}/${randomUUID()}/${filename}`],
  );
  for (const [client, path] of badPaths) {
    const result = await client.storage.from(bucket).upload(path, payload, { contentType: "text/plain", upsert: false });
    if (!result.error) additionalPaths.add(path);
    check(Boolean(result.error), label);
  }
  if (hasOtherCredentials) {
    await other.storage.from(bucket).remove([objectPath]);
    check(!(await owner.storage.from(bucket).download(objectPath)).error, label);
  }
  passed("Storage upload path ownership guards" + (hasOtherCredentials ? " and non-owner deletion denial" : ""));
} catch {
  console.error("FAIL: " + label + ". No credentials or response bodies are logged.");
  process.exitCode = 1;
} finally {
  // Only remove UUIDs created by this invocation, never pre-existing owner data.
  if (metadataCreated) {
    const result = await owner.from("documents").delete().eq("id", documentId).eq("user_id", ownerId).select("id");
    if (result.error || result.data?.length !== 1) incomplete = true;
  }
  if (objectCreated) {
    const result = await owner.storage.from(bucket).remove([objectPath]);
    if (result.error || !(await owner.storage.from(bucket).download(objectPath)).error) incomplete = true;
  }
  for (const path of additionalPaths) {
    if ((await owner.storage.from(bucket).remove([path])).error) incomplete = true;
  }
  if (objectCreated || metadataCreated) {
    if (incomplete) { console.error("FAIL: temporary test cleanup needs inspection."); process.exitCode = 1; }
    else passed("temporary object and metadata deleted; authenticated download now denied");
  }
  for (const [name, client] of [["owner", owner], ["non-owner", other]]) {
    const hadSession = Boolean((await client.auth.getSession()).data.session);
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error || (await client.auth.getSession()).data.session !== null) {
      console.error("FAIL: local test-session logout"); process.exitCode = 1;
    } else if (hadSession) passed(name + " API test-session logout");
  }
  if (!process.exitCode) passed("owner/non-owner test sessions logged out");
}
