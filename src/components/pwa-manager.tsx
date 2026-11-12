"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [applying, setApplying] = useState(false);
  const accepted = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanups: (() => void)[] = [];
    const isOurWorker = (worker: ServiceWorker | null) =>
      worker && new URL(worker.scriptURL).pathname === "/sw.js";

    // A production worker left on localhost must not interfere with HMR.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for (const item of registrations) {
          if ([item.active, item.waiting, item.installing].some(isOurWorker)) {
            await item.unregister();
          }
        }
        for (const name of await caches.keys()) {
          if (name.startsWith("scholartrack-")) await caches.delete(name);
        }
      }).catch(console.error);
      return;
    }
    if (!window.isSecureContext) return;

    const controllerChanged = () => {
      if (accepted.current) window.location.reload();
      else if (!disposed) {
        // Another tab may have accepted an update. Never reload this tab automatically.
        setRefreshNeeded(true);
        setWaiting(null);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);

    const checkUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void registration?.update().catch(console.error);
      }
    };

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        if (disposed) return;
        registration = result;
        const showWaiting = () => {
          if (!disposed && result.waiting && navigator.serviceWorker.controller) setWaiting(result.waiting);
        };
        const observeInstall = () => {
          const worker = result.installing;
          if (!worker) return;
          const changed = () => {
            if (worker.state === "installed") showWaiting();
          };
          worker.addEventListener("statechange", changed);
          cleanups.push(() => worker.removeEventListener("statechange", changed));
        };
        showWaiting();
        observeInstall();
        result.addEventListener("updatefound", observeInstall);
        cleanups.push(() => result.removeEventListener("updatefound", observeInstall));
        checkUpdate();
      }).catch((error) => console.error("PWA registration failed:", error));

    document.addEventListener("visibilitychange", checkUpdate);
    window.addEventListener("online", checkUpdate);
    const interval = window.setInterval(checkUpdate, 60 * 60 * 1000);
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkUpdate);
      window.removeEventListener("online", checkUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  if (!waiting && !refreshNeeded) return null;

  return (
    <aside className="pwa-notice fixed z-50 rounded-xl border bg-background p-4 shadow-lg" aria-label="Application update">
      <p role="status" className="text-sm leading-6">A new version is ready. Refresh when you have finished your work.</p>
      <Button className="mt-3 min-h-11 px-4" disabled={applying} onClick={() => {
        if (refreshNeeded || waiting?.state === "redundant" || waiting?.state === "activated") {
          window.location.reload();
          return;
        }
        accepted.current = true;
        setApplying(true);
        waiting?.postMessage({ type: "SKIP_WAITING" });
      }}>{applying ? "Updating…" : "Refresh app"}</Button>
    </aside>
  );
}
