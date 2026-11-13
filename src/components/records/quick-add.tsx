"use client";

import { useActionState, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/records/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Name-only quick add. Same Server Action (validation + authorization) as the full form; finish it later. */
export function QuickAdd({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const safe: Action = async (prev, fd) => {
    try { return await action(prev, fd); } catch (e) {
      if (e instanceof TypeError) return { error: "Could not reach the server. Nothing was saved — try again when you are online." };
      throw e;
    }
  };
  const [state, formAction, pending] = useActionState(safe, {} as FormState);
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)} className="h-11 sm:h-9"><Zap aria-hidden="true" />Quick add</Button>;
  const e = state.errors ?? {}, v = state.values ?? {};
  return (
    <form action={formAction} noValidate aria-busy={pending} aria-label="Quick add scholarship" className="mt-4 space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">Quick add <span className="help-text font-normal">— only the name is required; complete the rest later.</span></p>
      {state.error && (
        <div role="alert" className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">{state.error}
          {state.duplicate && <label className="mt-1.5 flex items-center gap-2 font-medium"><input type="checkbox" name="allow_duplicate" value="1" className="size-4" /> Save anyway</label>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input name="name" aria-label="Scholarship name" placeholder="Scholarship name *" defaultValue={v.name} maxLength={300} required disabled={pending} aria-invalid={e.name ? true : undefined} className="h-11 md:h-9" />
          {e.name && <p className="mt-1 text-sm text-danger">{e.name}</p>}
        </div>
        <div><Input name="official_url" aria-label="Official URL" placeholder="Official URL" inputMode="url" autoCapitalize="none" defaultValue={v.official_url} disabled={pending} aria-invalid={e.official_url ? true : undefined} className="h-11 md:h-9" />{e.official_url && <p className="mt-1 text-sm text-danger">{e.official_url}</p>}</div>
        <div><Input name="country" aria-label="Country" placeholder="Country" defaultValue={v.country} disabled={pending} className="h-11 md:h-9" /></div>
        <div><Input name="application_deadline" type="date" aria-label="Deadline" defaultValue={v.application_deadline} disabled={pending} aria-invalid={e.application_deadline ? true : undefined} className="h-11 md:h-9" />{e.application_deadline && <p className="mt-1 text-sm text-danger">{e.application_deadline}</p>}</div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-11 sm:h-9">{pending && <Loader2 className="animate-spin" aria-hidden="true" />}{pending ? "Saving…" : "Save scholarship"}</Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="h-11 sm:h-9">Cancel</Button>
      </div>
    </form>
  );
}
