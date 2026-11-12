import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ends the session server-side and clears its cookies. This is a Route Handler rather than a Server Action
// on purpose: an action makes Next re-render the current private page with the cleared cookies, and that
// render's redirect lands mid-stream. The client then performs a hard navigation (see SignOutButton).
export async function POST(request: NextRequest) {
  // Server Actions check the request origin; do the same here so another site cannot sign the owner out.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ ok: false }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
