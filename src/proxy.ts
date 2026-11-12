import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getOwnerId } from "@/lib/auth/owner";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const noStore = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store, max-age=0");
    return result;
  };
  const login = request.nextUrl.pathname === "/login";
  const ownerId = getOwnerId();
  if (!ownerId) {
    return noStore(login ? response : NextResponse.redirect(new URL("/login", request.url)));
  }
  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser verifies identity with Auth, including current account validity.
  const { data: { user }, error } = await supabase.auth.getUser();
  if ((!user || error || user.id !== ownerId) && !login) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return noStore(redirect);
  }
  // A signed-in owner skips the login page. Redirecting here, before anything renders, avoids a redirect
  // thrown from inside a streamed boundary. The database check prevents a loop if owner setup is broken.
  if (login && user && !error && user.id === ownerId) {
    const { data: isOwner } = await supabase.rpc("is_app_owner");
    if (isOwner === true) {
      const redirect = NextResponse.redirect(new URL("/", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return noStore(redirect);
    }
  }
  // The login page still checks the database owner itself (defence in depth).
  return noStore(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|offline.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
