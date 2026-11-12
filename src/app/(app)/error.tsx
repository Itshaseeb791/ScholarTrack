"use client";

import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};

// Shown inside the app shell, so navigation stays usable. Details are never shown to the user.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="alert" className="rounded-xl border bg-card p-6">
      <h1 className="text-xl font-semibold">{online ? "Something went wrong" : "You're offline"}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {online ? "We couldn't load this page. Your data is safe. Try again in a moment." : "Reconnect to the internet, then try again."}
      </p>
      <button type="button" onClick={reset} className="mt-5 min-h-11 rounded-lg border px-5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px">Try again</button>
    </div>
  );
}
