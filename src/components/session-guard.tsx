"use client";

import { useEffect } from "react";

export const AUTH_CHANNEL = "scholartrack-auth";

// Set once this page has started leaving (its own sign-out, or a message from another tab). Channel objects
// in the same page also receive each other's messages, so without this a signing-out tab would navigate twice
// and cut its own first navigation off mid-stream.
let leaving = false;
export const markLeaving = () => { const was = leaving; leaving = true; return was; };

// Private pages mount this. It ends authenticated state in two cases the server cannot see:
// another tab signed out, and Safari restoring a page from the back/forward cache.
export function SessionGuard() {
  useEffect(() => {
    const leave = () => { if (!markLeaving()) window.location.replace("/login"); };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event) => { if (event.data === "signed-out") leave(); };
    } catch { /* unavailable: the next request is still redirected by the proxy */ }
    // A restored page is reloaded through the proxy, which redirects when the session is gone.
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onShow);
    return () => { channel?.close(); window.removeEventListener("pageshow", onShow); };
  }, []);
  return null;
}
