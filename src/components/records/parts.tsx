import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui-kit";
import { buildHref, PAGE_SIZE } from "@/lib/records/params";
import { DEGREE_TYPES, FUNDING_TYPES_EXTRA } from "@/lib/records/validate";
import { daysUntil, remaining, urgency } from "@/lib/dashboard-logic";
import { formatDateOnly } from "@/lib/time";

export const degreeLabel = (v: unknown) => DEGREE_TYPES.find((d) => d[0] === v)?.[1] ?? String(v ?? "");
export const fundingLabel = (v: unknown) => FUNDING_TYPES_EXTRA.find((d) => d[0] === v)?.[1] ?? "";
export const s = (v: unknown) => (typeof v === "string" && v ? v : null);

export function formatMoney(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined || !currency) return null;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency), maximumFractionDigits: 2 }).format(Number(amount)); }
  catch { return `${amount} ${currency}`; }
}

/** Only http(s) URLs are rendered as links, even though they were validated on save. */
export function ExtLink({ href, children }: { href: unknown; children?: React.ReactNode }) {
  const url = s(href);
  if (!url || !/^https?:\/\//i.test(url)) return <span className="text-muted-foreground">Not set</span>;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
      <span className="truncate">{children ?? host}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function Deadline({ date, today }: { date: unknown; today: string }) {
  const d = s(date);
  if (!d) return <span className="text-muted-foreground">No deadline</span>;
  const n = daysUntil(d, today), u = urgency(n);
  const tone = { overdue: "text-danger", urgent: "text-warning", normal: "text-foreground" }[u];
  return <span className={tone}>{formatDateOnly(d)} <span className="text-xs opacity-80">· {remaining(n)}</span></span>;
}

export function Detail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{children ?? <span className="text-muted-foreground">Not set</span>}</dd>
    </div>
  );
}

export function Empty({ filtered, icon, noun, addHref, addLabel }: { filtered: boolean; icon: React.ComponentProps<typeof EmptyState>["icon"]; noun: string; addHref: string; addLabel: string }) {
  return (
    <Card>
      {filtered ? (
        <EmptyState icon={SearchX} title={`No ${noun} match your search`}>Try a different search or <Link href="?" className="font-medium text-primary underline">clear the filters</Link>.</EmptyState>
      ) : (
        <EmptyState icon={icon} title={`No ${noun} yet`}>
          Add your first one to start tracking.
          <Link href={addHref} className={buttonVariants({ className: "mt-4 h-11" })}><Plus aria-hidden="true" />{addLabel}</Link>
        </EmptyState>
      )}
    </Card>
  );
}

export function Pager({ base, current, page, total }: { base: string; current: Record<string, string>; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, to = Math.min(total, page * PAGE_SIZE);
  const link = (p: number) => buildHref(base, current, { page: p > 1 ? String(p) : null });
  const cls = buttonVariants({ variant: "outline", className: "h-11 sm:h-9" });
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="help-text" aria-live="polite">{total === 0 ? "0 results" : `${from}–${to} of ${total}`}</p>
      {pages > 1 && (
        <div className="flex gap-2">
          {page > 1 ? <Link href={link(page - 1)} className={cls} rel="prev"><ChevronLeft aria-hidden="true" />Previous</Link> : null}
          {page < pages ? <Link href={link(page + 1)} className={cls} rel="next">Next<ChevronRight aria-hidden="true" /></Link> : null}
        </div>
      )}
    </nav>
  );
}

export function AddButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={buttonVariants({ className: "h-11 shrink-0 sm:h-9" })}><Plus aria-hidden="true" />{children}</Link>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" aria-hidden="true" />{children}</Link>;
}
