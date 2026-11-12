import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerId } from "./owner";

// React cache deduplicates only within a server render, never across users.
export const getOwnerSession = cache(async () => {
  await connection();
  const ownerId = getOwnerId();
  if (!ownerId) return null;
  const supabase = await createClient();
  // Both checks are independent requests: run them together, and still require both to pass.
  const [{ data: { user }, error }, { data: isOwner, error: ownerError }] = await Promise.all([
    supabase.auth.getUser(), supabase.rpc("is_app_owner"),
  ]);
  if (error || !user || user.id !== ownerId) return null;
  if (ownerError || isOwner !== true) return null;
  return { supabase, user };
});

// Call at every private data/action boundary, including future feature modules.
export async function requireOwner() {
  const session = await getOwnerSession();
  if (!session) redirect("/login");
  return session;
}
