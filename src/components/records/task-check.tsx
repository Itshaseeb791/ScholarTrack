"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toggleTask } from "@/lib/records/planning-actions";

/** One-tap completion. Optimistic, so it feels instant on a phone; the server stamps completed_at. */
export function TaskCheck({ id, title, status }: { id: string; title: string; status: string }) {
  const done = status === "completed";
  const [optimistic, setOptimistic] = useOptimistic(done, (_cur, next: boolean) => next);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" role="checkbox" aria-checked={optimistic} disabled={pending || status === "cancelled"} data-testid="task-check"
        aria-label={`${optimistic ? "Reopen" : "Complete"}: ${title}`}
        onClick={() => start(async () => {
          setError(null); setOptimistic(!done);
          try { const r = await toggleTask(id); if (r.error) setError(r.error); }
          catch (e) { if (e instanceof TypeError) setError("You appear to be offline. Nothing was changed."); else throw e; }
        })}
        className="grid size-11 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent disabled:opacity-50">
        <span className={`grid size-6 place-items-center rounded-full border-2 transition-colors ${optimistic ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"}`}>
          {optimistic && <Check className="size-4" aria-hidden="true" />}
        </span>
      </button>
      {error && <span role="alert" className="sr-only">{error}</span>}
    </>
  );
}
