"use client";

import { useState, useTransition } from "react";
import { AUTH_CHANNEL, markLeaving } from "@/components/session-guard";

export function SignOutButton() {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <>
      {failed && <span role="alert" className="text-xs text-destructive">Sign out failed. Try again.</span>}
      <button type="button" disabled={pending} aria-busy={pending}
        className="min-h-11 rounded-md px-2 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70 disabled:opacity-50"
        onClick={() => start(async () => {
          setFailed(false);
          const ok = await fetch("/auth/signout", { method: "POST", credentials: "same-origin" }).then((r) => r.ok).catch(() => false);
          if (!ok) return setFailed(true);
          markLeaving(); // this tab navigates itself below; the guard must not repeat it
          try { const channel = new BroadcastChannel(AUTH_CHANNEL); channel.postMessage("signed-out"); channel.close(); } catch { /* unsupported */ }
          // Hard navigation drops all client state, including the Router Cache and hidden route DOM.
          window.location.replace("/login");
        })}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}
