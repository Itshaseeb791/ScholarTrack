// Read-only probe. Never logs URLs, keys, users, sessions, or response bodies.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const loaded = nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Required public Supabase environment variables are missing.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
});
console.log(`Application environment loaded: ${loaded.loadedEnvFiles.length > 0}`);
console.log("Supabase client initialization: passed");
const ownerConfigured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.SUPABASE_OWNER_ID || "");
console.log(`Owner environment configured: ${ownerConfigured}`);
if (!ownerConfigured) process.exitCode = 1;

// Permission-denied is distinct from a missing table/function. Check all required
// relations rather than inferring migration completion from one denied query.
const tables = {
  universities: "id,user_id,name,country,city,website,notes,created_at,updated_at",
  programs: "id,user_id,university_id,name,degree_type,field_of_study,intake,duration,tuition_fee,currency,application_deadline,official_url,requirements,created_at,updated_at",
  scholarships: "id,user_id,name,provider,country,funding_type,funding_amount,currency,eligibility_requirements,application_deadline,official_url,notes,created_at,updated_at",
  applications: "id,user_id,program_id,status,submission_date,notes,created_at,updated_at",
  application_scholarships: "user_id,application_id,scholarship_id,created_at",
  tasks: "id,user_id,application_id,title,description,priority,status,due_date,created_at,updated_at",
  documents: "id,user_id,file_name,storage_path,mime_type,file_size,created_at",
  application_documents: "user_id,application_id,document_id,created_at",
  events: "id,user_id,application_id,title,event_type,starts_at,ends_at,notes,created_at,updated_at",
  reminders: "id,user_id,task_id,event_id,remind_at,status,created_at",
};

try {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  console.log(`Auth settings HTTP status: ${response.status}`);
  if (response.ok) {
    const settings = await response.json();
    console.log(`Public signup disabled: ${settings.disable_signup === true}`);
    if (settings.disable_signup !== true) process.exitCode = 1;
  }
  if (!response.ok) process.exitCode = 1;
  const results = await Promise.allSettled(Object.entries(tables).map(async ([table, columns]) => {
    const { data, error, status } = await client.from(table).select(columns).limit(1);
    // 42501 confirms a database privilege denial, not an invalid API key.
    const denied = [401, 403].includes(status) && error?.code === "42501";
    console.log(`${table}: anonymous denied=${denied}, HTTP=${status}, unexpected rows=${Boolean(data?.length)}`);
    if (!denied) process.exitCode = 1;
  }));
  if (results.some((result) => result.status === "rejected")) {
    console.log("One or more table probes could not complete.");
    process.exitCode = 1;
  }
  const { data: isOwner, error: ownerError } = await client.rpc("is_app_owner");
  const ownerDenied = !ownerError && isOwner === false;
  console.log(`Owner RPC exists and rejects anonymous identity: ${ownerDenied}`);
  if (!ownerDenied) process.exitCode = 1;
  const { data: objects, error: storageError } = await client.storage.from("scholarship-documents").list("", { limit: 1 });
  // Storage may return an empty list when RLS filters every object. This alone
  // proves neither a private bucket nor the presence of the expected policies.
  const noVisibleObjects = Boolean(storageError) || (Array.isArray(objects) && objects.length === 0);
  console.log(`No storage objects visible anonymously: ${noVisibleObjects}`);
  if (!noVisibleObjects) process.exitCode = 1;
  console.log("Bucket existence/privacy, RLS definitions, owner and non-owner sessions still require authenticated/admin verification.");
} catch {
  console.error("Backend probe could not reach the configured project. No live verification completed.");
  process.exitCode = 1;
}
