"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui-kit";
import { daysUntil, remaining } from "@/lib/dashboard-logic";
import { requirementsProgress } from "@/lib/applications";
import { formatDateOnly } from "@/lib/time";
import { addRequirement, deleteRequirement, setRequirementComplete, updateRequirement, type ActionState } from "@/lib/records/application-actions";
import type { Requirement } from "@/lib/records/application-queries";
import { ProgressBar } from "./application-parts";

const offline = "Could not reach the server. Nothing was saved; try again when you are online.";
const guard = (fn: (prev: ActionState, fd: FormData) => Promise<ActionState>) => async (prev: ActionState, fd: FormData): Promise<ActionState> => {
  try { return await fn(prev, fd); } catch (e) { if (e instanceof TypeError) return { error: offline }; throw e; }
};

function Item({ applicationId, item, today, onToggle, onError }: {
  applicationId: string; item: Requirement; today: string; onToggle: (id: string, complete: boolean) => void; onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [state, formAction, saving] = useActionState(guard(async (prev, fd) => {
    const r = await updateRequirement(applicationId, item.id, prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }), {} as ActionState);
  const late = !item.is_complete && item.due_date && item.due_date < today;
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    onError(null);
    try { const r = await fn(); if (r.error) onError(r.error); } catch (e) { if (e instanceof TypeError) onError(offline); else throw e; }
  });
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button type="button" role="checkbox" aria-checked={item.is_complete} aria-label={`${item.is_complete ? "Mark incomplete" : "Mark complete"}: ${item.title}`} disabled={pending}
          onClick={() => run(async () => { onToggle(item.id, !item.is_complete); return setRequirementComplete(applicationId, item.id, !item.is_complete); })}
          className="grid size-11 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent">
          <span className={`grid size-6 place-items-center rounded-md border-2 transition-colors ${item.is_complete ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"}`}>
            {item.is_complete && <Check className="size-4" aria-hidden="true" />}
          </span>
        </button>
        <div className="min-w-0 flex-1 py-2">
          <p className={`break-words text-sm font-medium ${item.is_complete ? "text-muted-foreground line-through" : ""}`}>{item.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.due_date && <span className="inline-flex items-center gap-1.5">Due {formatDateOnly(item.due_date)}{!item.is_complete && <Pill tone={late ? "danger" : daysUntil(item.due_date, today) <= 3 ? "warning" : "neutral"}>{remaining(daysUntil(item.due_date, today))}</Pill>}</span>}
          </div>
          {item.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.notes}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Edit ${item.title}`} aria-expanded={editing} onClick={() => setEditing((e) => !e)}><Pencil aria-hidden="true" /></Button>
        <Button type="button" variant={confirming ? "destructive" : "ghost"} size={confirming ? "default" : "icon"} className={confirming ? "h-11" : "size-11"} disabled={pending}
          aria-label={confirming ? `Confirm delete ${item.title}` : `Delete ${item.title}`}
          onClick={() => { if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); } else run(() => deleteRequirement(applicationId, item.id)); }}>
          <Trash2 aria-hidden="true" />{confirming && "Confirm"}
        </Button>
      </div>
      {editing && (
        <form action={formAction} className="mt-2 grid gap-2 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2" aria-label={`Edit ${item.title}`}>
          {state.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{state.error}</p>}
          <div className="sm:col-span-2"><Input name="title" aria-label="Requirement" defaultValue={state.values?.title ?? item.title} maxLength={300} required disabled={saving} className="h-11 md:h-9" />{state.errors?.title && <p className="mt-1 text-sm text-danger">{state.errors.title}</p>}</div>
          <div><Input name="due_date" type="date" aria-label="Due date" defaultValue={state.values?.due_date ?? item.due_date ?? ""} disabled={saving} className="h-11 md:h-9" />{state.errors?.due_date && <p className="mt-1 text-sm text-danger">{state.errors.due_date}</p>}</div>
          <div className="sm:col-span-2"><Textarea name="notes" aria-label="Notes" rows={2} placeholder="Notes" defaultValue={state.values?.notes ?? item.notes ?? ""} maxLength={2000} disabled={saving} /></div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving} className="h-11 sm:h-9">{saving && <Loader2 className="animate-spin" aria-hidden="true" />}Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving} className="h-11 sm:h-9">Cancel</Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function RequirementsPanel({ applicationId, items, today }: { applicationId: string; items: Requirement[]; today: string }) {
  const [optimistic, setOptimistic] = useOptimistic(items, (cur, a: { id: string; complete: boolean }) => cur.map((r) => (r.id === a.id ? { ...r, is_complete: a.complete } : r)));
  const [error, setError] = useState<string | null>(null);
  const [state, formAction, adding] = useActionState(guard((prev, fd) => addRequirement(applicationId, prev, fd)), {} as ActionState);
  const p = requirementsProgress(optimistic);
  return (
    <div className="space-y-4">
      <div>
        <ProgressBar done={p.done} total={p.total} />
        <p className="help-text mt-1" aria-live="polite">{p.total === 0 ? "No requirements yet. Add the items this application needs." : `${p.done} of ${p.total} completed · ${p.remaining} remaining`}</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">{error}</p>}
      {optimistic.length > 0 && (
        <ul className="divide-y">
          {optimistic.map((r) => <Item key={r.id} applicationId={applicationId} item={r} today={today} onToggle={(id, complete) => setOptimistic({ id, complete })} onError={setError} />)}
        </ul>
      )}
      <form action={formAction} aria-label="Add requirement" className="space-y-2 rounded-lg border border-dashed p-3">
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
          <div><Input name="title" aria-label="New requirement" placeholder="Add a requirement, e.g. Recommendation letters" maxLength={300} required disabled={adding} defaultValue={state.errors ? state.values?.title : undefined} aria-invalid={state.errors?.title ? true : undefined} className="h-11 md:h-9" />{state.errors?.title && <p className="mt-1 text-sm text-danger">{state.errors.title}</p>}</div>
          <div><Input name="due_date" type="date" aria-label="New requirement due date" disabled={adding} defaultValue={state.errors ? state.values?.due_date : undefined} className="h-11 md:h-9" />{state.errors?.due_date && <p className="mt-1 text-sm text-danger">{state.errors.due_date}</p>}</div>
          <Button type="submit" disabled={adding} className="h-11 sm:h-9">{adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}Add</Button>
        </div>
      </form>
    </div>
  );
}
