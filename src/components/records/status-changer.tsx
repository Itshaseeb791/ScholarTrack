"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { changeStatus, type ActionState } from "@/lib/records/application-actions";
import { selectClass } from "./record-form";

/** Only transitions the rules allow are offered; the server re-checks them and the database writes the history row atomically. */
export function StatusChanger({ applicationId, current, allowed }: { applicationId: string; current: string; allowed: readonly (readonly [string, string])[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    try {
      const r = await changeStatus(applicationId, prev, fd);
      if (r.ok) setOpen(false);
      return r;
    } catch (e) {
      if (e instanceof TypeError) return { error: "Could not reach the server. The status was not changed; try again when you are online." };
      throw e;
    }
  }, {});
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
      <DialogTrigger render={<Button className="h-11 sm:h-9" />}><ArrowRightLeft aria-hidden="true" />Change status</DialogTrigger>
      <DialogContent>
        <form action={formAction} className="grid gap-4" aria-busy={pending}>
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
            <DialogDescription>Recorded in the application history. A missing submission or decision date is filled with today.</DialogDescription>
          </DialogHeader>
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">{state.error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="status-new">New status</Label>
            <select id="status-new" name="status" required defaultValue="" disabled={pending} className={selectClass} aria-invalid={state.errors?.status ? true : undefined} aria-describedby={state.errors?.status ? "status-new-err" : undefined}>
              <option value="" disabled>Choose a status…</option>
              {allowed.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {state.errors?.status && <p id="status-new-err" className="text-sm text-danger">{state.errors.status}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status-note">Note (optional)</Label>
            <Textarea id="status-note" name="note" rows={3} maxLength={1000} disabled={pending} placeholder="e.g. Submitted through the portal" defaultValue={state.values?.note} />
            {state.errors?.note && <p className="text-sm text-danger">{state.errors.note}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="h-11 sm:h-9">Cancel</Button>
            <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-current={current}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />}{pending ? "Saving…" : "Save status"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
