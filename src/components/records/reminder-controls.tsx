"use client";

import { useActionState, useState, useTransition } from "react";
import { BellPlus, Check, EyeOff, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFFSETS, type SourceType } from "@/lib/reminders";
import {
  acknowledgeReminder, addReminders, addSuggestedReminders, deleteReminder, dismissReminder, restoreReminder, setReminderEnabled, type PlanState,
} from "@/lib/records/planning-actions";
import { selectClass } from "./record-form";

const offline = "You appear to be offline or the server is unreachable. Nothing was changed.";

/** Per-reminder buttons. Each is a separate server call; errors are shown and the action can be retried. */
export function ReminderButtons({ id, state, enabled, compact }: { id: string; state: string; enabled: boolean; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    setError(null);
    try { const r = await fn(); if (r.error) setError(r.error); } catch (e) { if (e instanceof TypeError) setError(offline); else throw e; }
  });
  const cls = compact ? "h-11 px-3 sm:h-9" : "h-11 sm:h-9";
  const active = state === "due" || state === "scheduled" || state === "no_date";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state === "due" && <Button type="button" size="sm" className={cls} disabled={pending} onClick={() => run(() => acknowledgeReminder(id))}><Check aria-hidden="true" />Done</Button>}
      {state === "due" && <Button type="button" size="sm" variant="outline" className={cls} disabled={pending} onClick={() => run(() => dismissReminder(id))}><EyeOff aria-hidden="true" />Dismiss</Button>}
      {(state === "dismissed" || state === "acknowledged") && <Button type="button" size="sm" variant="outline" className={cls} disabled={pending} onClick={() => run(() => restoreReminder(id))}><RotateCcw aria-hidden="true" />Restore</Button>}
      {(active || state === "disabled") && <Button type="button" size="sm" variant="ghost" className={cls} disabled={pending} onClick={() => run(() => setReminderEnabled(id, !enabled))}>{enabled ? "Disable" : "Enable"}</Button>}
      <Button type="button" size="sm" variant="ghost" className={cls} disabled={pending} aria-label="Delete reminder" onClick={() => run(() => deleteReminder(id))}><Trash2 aria-hidden="true" /></Button>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function SuggestButton({ type, sourceId, label }: { type: SourceType; sourceId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={pending}
        onClick={() => start(async () => { setError(null); try { const r = await addSuggestedReminders(type, sourceId); if (r.error) setError(r.error); } catch (e) { if (e instanceof TypeError) setError(offline); else throw e; } })}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BellPlus aria-hidden="true" />}{label}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** `sources` lets one form target several things (e.g. an application deadline or one of its requirements). */
export function AddReminderForm({ sources }: { sources: { type: SourceType; id: string; label: string }[] }) {
  const [custom, setCustom] = useState(false);
  const [ref, setRef] = useState(0);
  const [state, formAction, pending] = useActionState(async (prev: PlanState, fd: FormData): Promise<PlanState> => {
    try { return await addReminders(prev, fd); } catch (e) { if (e instanceof TypeError) return { error: offline }; throw e; }
  }, {} as PlanState);
  const src = sources[ref] ?? sources[0];
  return (
    <form action={formAction} aria-label="Add reminder" aria-busy={pending} className="space-y-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="source_type" value={src.type} /><input type="hidden" name="source_id" value={src.id} />
      <input type="hidden" name="schedule" value={custom ? "custom" : "offset"} />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-success">Reminder saved.</p>}
      {sources.length > 1 && (
        <div className="space-y-1.5"><Label htmlFor="rem-src">Remind me about</Label>
          <select id="rem-src" value={ref} onChange={(e) => setRef(Number(e.target.value))} className={selectClass} disabled={pending}>{sources.map((s, i) => <option key={s.id + s.type} value={i}>{s.label}</option>)}</select></div>
      )}
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">When</legend>
        {!custom ? (
          <div className="grid gap-1 sm:grid-cols-2">
            {OFFSETS.map(([n, l]) => <label key={n} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="offset" value={n} disabled={pending} className="size-5 accent-[var(--primary)]" />{l}</label>)}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Input name="remind_date" type="date" aria-label="Reminder date" disabled={pending} className="h-11 md:h-9" />{state.errors?.remind_date && <p className="mt-1 text-sm text-danger">{state.errors.remind_date}</p>}</div>
            <div><Input name="remind_time" type="time" aria-label="Reminder time" defaultValue="09:00" disabled={pending} className="h-11 md:h-9" />{state.errors?.remind_time && <p className="mt-1 text-sm text-danger">{state.errors.remind_time}</p>}</div>
          </div>
        )}
        {state.errors?.offsets && <p className="text-sm text-danger">{state.errors.offsets}</p>}
        {(state.errors?.source_id || state.errors?.source_type) && <p className="text-sm text-danger">{state.errors.source_id ?? state.errors.source_type}</p>}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11 sm:h-9" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BellPlus aria-hidden="true" />}Add reminder</Button>
        <Button type="button" variant="ghost" className="h-11 sm:h-9" disabled={pending} onClick={() => setCustom((c) => !c)}>{custom ? "Use days before" : "Pick a custom time"}</Button>
      </div>
    </form>
  );
}
