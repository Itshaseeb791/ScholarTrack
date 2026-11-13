"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { selectClass } from "./record-form";
import { buildHref } from "@/lib/records/params";

export type FilterDef = { name: string; label: string; options: readonly (readonly [string, string])[] };

/** URL-driven search/filter/sort. `current` comes from the server, so back/forward and shared links just work. */
export function FilterBar({ current, filters, sorts, placeholder }: {
  current: Record<string, string>; filters: FilterDef[]; sorts: readonly (readonly [string, string])[]; placeholder: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(current.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(current);
  useEffect(() => { latest.current = current; });
  // Back/forward or a shared link changed the URL: adopt it, but never overwrite what is being typed.
  const [seen, setSeen] = useState(current.q ?? "");
  if ((current.q ?? "") !== seen) { setSeen(current.q ?? ""); if ((current.q ?? "") !== q.trim()) setQ(current.q ?? ""); }
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (patch: Record<string, string | null>) => start(() => router.replace(buildHref(path, latest.current, { ...patch, page: null })));
  const active = Boolean(current.q) || filters.some((f) => current[f.name]);

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); clearTimeout(timer.current); go({ q: q.trim() || null }); }} className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" name="q" value={q} aria-label="Search" placeholder={placeholder} autoComplete="off" enterKeyHint="search" maxLength={80}
          onChange={(e) => { setQ(e.target.value); clearTimeout(timer.current); const v = e.target.value.trim(); timer.current = setTimeout(() => go({ q: v || null }), 350); }}
          className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-10 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10 md:text-sm" />
        {pending && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {filters.map((f) => (
          <select key={f.name} aria-label={f.label} value={current[f.name] ?? ""} onChange={(e) => go({ [f.name]: e.target.value || null })} className={selectClass + " sm:w-auto sm:min-w-40"}>
            <option value="">{f.label}: all</option>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <select aria-label="Sort by" value={current.sort ?? sorts[0][0]} onChange={(e) => go({ sort: e.target.value === sorts[0][0] ? null : e.target.value })} className={selectClass + " sm:w-auto sm:min-w-40"}>
          {sorts.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { clearTimeout(timer.current); setQ(""); start(() => router.replace(path)); }}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary hover:bg-accent sm:col-span-1"><X className="size-4" aria-hidden="true" />Clear filters</button>
        )}
      </div>
    </form>
  );
}
