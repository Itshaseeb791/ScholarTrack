"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DeleteState } from "@/lib/records/actions";

/** `blocked` is computed on the server from dependent records; the action re-checks it regardless. */
export function DeleteButton({ action, noun, name, impact, blocked }: {
  action: () => Promise<DeleteState>; noun: string; name: string; impact: string; blocked?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setError(null);
    try {
      const r = await action(); // success redirects; a returned value is always an error
      if (r?.error) setError(r.error);
    } catch (e) {
      if (e instanceof TypeError) setError("Could not reach the server. Nothing was deleted — try again when you are online.");
      else throw e;
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); setError(null); } }}>
      <DialogTrigger render={<Button variant="destructive" className="h-11 sm:h-9" />}><Trash2 aria-hidden="true" />Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {noun}?</DialogTitle>
          <DialogDescription>{blocked ?? <><strong className="text-foreground">{name}</strong> will be permanently deleted. {impact}</>}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending} className="h-11 sm:h-9">{blocked ? "Close" : "Cancel"}</Button>
          {!blocked && (
            <Button variant="destructive" onClick={run} disabled={pending} className="h-11 sm:h-9">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}{pending ? "Deleting…" : "Delete permanently"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
