"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/records/actions";

export type FieldDef = {
  name: string; label: string; type?: "text" | "url" | "date" | "number" | "select" | "textarea" | "checkbox" | "checks";
  required?: boolean; placeholder?: string; hint?: string; maxLength?: number; wide?: boolean;
  options?: readonly (readonly [string, string])[]; empty?: string;
  groups?: { label: string; options: readonly (readonly [string, string])[] }[]; // select with <optgroup>s
};
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export const selectClass = "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50 md:h-9 md:text-sm";

export function RecordForm({ fields, action, initial = {}, cancelHref, submitLabel, hidden = {} }: {
  fields: FieldDef[]; action: Action; initial?: Record<string, string>; cancelHref: string; submitLabel: string; hidden?: Record<string, string>;
}) {
  const dirty = useRef(false);
  const [blurErrors, setBlurErrors] = useState<Record<string, string>>({});
  // A failed network call (device offline) must not crash the page: surface it and allow retry.
  const safe: Action = async (prev, fd) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { error: "You appear to be offline. Nothing was saved — reconnect and try again.", values: Object.fromEntries([...fd].filter(([, v]) => typeof v === "string")) as Record<string, string> };
    try { return await action(prev, fd); } catch (e) {
      if (e instanceof TypeError) return { error: "Could not reach the server. Nothing was saved — check your connection and try again." };
      throw e;
    }
  };
  const [state, formAction, pending] = useActionState(safe, {} as FormState);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    // In-app links (sidebar, bottom bar, Cancel, breadcrumbs) are client navigations, so beforeunload never fires for them.
    const click = (e: MouseEvent) => {
      if (!dirty.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== location.origin || a.href === location.href) return;
      if (!window.confirm("Discard your unsaved changes?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true); // capture: runs before Next's Link handler
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true); };
  }, []);
  // A failed save leaves the form dirty again (onSubmit cleared it optimistically).
  useEffect(() => { if (state.error || state.errors) dirty.current = true; }, [state]);

  const value = (n: string) => state.values?.[n] ?? initial[n] ?? "";
  const err = (n: string) => state.errors?.[n] ?? blurErrors[n];
  const entries = Object.keys(state.errors ?? {});

  return (
    <form action={formAction} noValidate onChange={() => { dirty.current = true; }} aria-busy={pending}
      onSubmit={() => { dirty.current = false; }} className="space-y-5">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state.error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {state.error}
          {state.duplicate && (
            <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" name="allow_duplicate" value="1" className="size-4" /> Save anyway, this is a different record</label>
          )}
        </div>
      )}
      {entries.length > 0 && <p role="alert" className="sr-only">Please fix {entries.length} field{entries.length > 1 ? "s" : ""}.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = "f-" + f.name, e = err(f.name), v = value(f.name);
          const common = { id, name: f.name, "aria-invalid": e ? true : undefined, "aria-describedby": e ? id + "-err" : f.hint ? id + "-hint" : undefined, disabled: pending };
          return (
            <div key={f.name} className={`space-y-1.5 ${f.wide || f.type === "textarea" ? "sm:col-span-2" : ""}`}>
              {f.type === "checks" ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{f.label}</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {f.options?.map(([val, label]) => (
                      <label key={val} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name={f.name} value={val} disabled={pending} className="size-5 accent-[var(--primary)]" />{label}</label>
                    ))}
                  </div>
                </fieldset>
              ) : f.type === "checkbox" ? (
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                  <input type="checkbox" name={f.name} defaultChecked={v === "on" || v === "true"} disabled={pending} className="size-5 accent-[var(--primary)]" />{f.label}
                </label>
              ) : (
                <Label htmlFor={id}>{f.label}{f.required && <span className="text-danger" aria-hidden="true"> *</span>}{f.required && <span className="sr-only"> (required)</span>}</Label>
              )}
              {f.type === "checks" ? null : f.type === "textarea" ? <Textarea {...common} defaultValue={v} placeholder={f.placeholder} maxLength={5000} rows={4} />
                : f.type === "select" ? (
                  <select {...common} defaultValue={v} className={selectClass}>
                    <option value="">{f.empty ?? "Not set"}</option>
                    {f.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    {f.groups?.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</optgroup>)}
                  </select>
                ) : f.type === "checkbox" ? null : (
                  <Input {...common} defaultValue={v} placeholder={f.placeholder} maxLength={f.maxLength ?? 500}
                    type={f.type === "date" ? "date" : f.type === "number" ? "text" : "text"}
                    inputMode={f.type === "number" ? "decimal" : f.type === "url" ? "url" : undefined}
                    autoCapitalize={f.type === "url" ? "none" : undefined} autoCorrect={f.type === "url" ? "off" : undefined}
                    className="h-10 md:h-9"
                    onBlur={f.required ? (ev) => setBlurErrors((b) => ({ ...b, [f.name]: ev.currentTarget.value.trim() ? "" : `${f.label} is required.` })) : undefined} />
                )}
              {e ? <p id={id + "-err"} className="text-sm text-danger">{e}</p> : f.hint ? <p id={id + "-hint"} className="help-text">{f.hint}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-10 -mx-5 flex gap-3 border-t bg-card/95 px-5 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border md:bottom-2">
        <Button type="submit" disabled={pending} className="h-11 flex-1 sm:h-10 sm:flex-none sm:px-6">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{pending ? "Saving…" : submitLabel}
        </Button>
        <Link href={cancelHref}
          className={buttonVariants({ variant: "outline", className: "h-11 sm:h-10" })} aria-disabled={pending}>Cancel</Link>
      </div>
    </form>
  );
}
