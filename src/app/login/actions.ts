"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnerId } from "@/lib/auth/owner";

// `email` is echoed back so a failed attempt does not wipe what was typed; the password is never returned.
export type LoginState = { error: string | null; field?: "email" | "password"; email?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const ownerId = getOwnerId();
  if (!ownerId) return { error: "Owner access has not been configured. Complete the setup in the README." };
  const rawEmail = formData.get("email");
  const password = formData.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "Enter a valid email address.", field: "email", email };
  }
  if (typeof password !== "string" || !password || password.length > 1024) {
    return { error: "Enter your password.", field: "password", email };
  }
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user || data.user.id !== ownerId) {
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      // Deliberately identical for a wrong password, an unknown email and a non-owner account.
      return { error: "That email and password do not match the owner account.", email };
    }
    const { data: isOwner, error: ownerError } = await supabase.rpc("is_app_owner");
    if (ownerError || isOwner !== true) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Owner database access is unavailable. Check the migration and owner setup.", email };
    }
  } catch {
    return { error: "Unable to reach the sign-in service. Check your connection and try again.", email };
  }
  redirect("/");
}
