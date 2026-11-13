import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { FilterBar } from "@/components/records/filter-bar";
import { QuickAdd } from "@/components/records/quick-add";
import { AddButton, Deadline, Empty, Pager, formatMoney, fundingLabel, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveScholarship } from "@/lib/records/actions";
import { distinct, FILTERS, hasExtras, listScholarships, SORTS } from "@/lib/records/queries";
import { hasActiveFilters, parseListParams, type RawParams } from "@/lib/records/params";
import { FUNDING_TYPES_BASE, FUNDING_TYPES_EXTRA } from "@/lib/records/validate";
import { getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Scholarships · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const p = parseListParams(await searchParams, SORTS.scholarships, FILTERS.scholarships);
  const today = todayIn(getTimezone());
  const extras = await hasExtras(supabase);
  const [{ rows, total }, countries] = await Promise.all([listScholarships(supabase, p, today), distinct(supabase, "scholarships", "country")]);
  const current: Record<string, string> = { ...(p.q && { q: p.q }), ...p.filters, ...(p.sort !== SORTS.scholarships[0] && { sort: p.sort }) };
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={GraduationCap} title="Scholarships"><p className="help-text">{total} saved</p></PageHeader>
        <div className="flex gap-2"><QuickAdd action={saveScholarship.bind(null, null)} /><AddButton href="/scholarships/new">Add scholarship</AddButton></div>
      </div>
      <div className="mt-6">
        <FilterBar current={current} placeholder="Search name, provider or country"
          filters={[
            { name: "country", label: "Country", options: countries.map((c) => [c, c] as const) },
            { name: "funding", label: "Funding", options: extras ? FUNDING_TYPES_EXTRA : FUNDING_TYPES_BASE },
            { name: "deadline", label: "Deadline", options: [["open", "Upcoming"], ["30", "Next 30 days"], ["past", "Passed"], ["none", "No deadline"]] },
          ]}
          sorts={[["deadline", "Deadline (soonest)"], ["recent", "Recently added"], ["name", "Name A–Z"]]} />
      </div>
      <div className="mt-5">
        {rows.length === 0 ? <Empty filtered={hasActiveFilters(p)} icon={GraduationCap} noun="scholarships" addHref="/scholarships/new" addLabel="Add scholarship" /> : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/scholarships/${r.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate font-medium">{String(r.name)}</p>
                      <p className="help-text truncate">{[s(r.provider), s(r.country)].filter(Boolean).join(" · ") || "Details not added yet"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {s(r.funding_type) && <Pill tone={r.funding_type === "full" ? "success" : "info"}>{fundingLabel(r.funding_type)}</Pill>}
                      {formatMoney(r.funding_amount, r.currency) && <span className="text-muted-foreground">{formatMoney(r.funding_amount, r.currency)}</span>}
                      <Deadline date={r.application_deadline} today={today} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {total > 0 && <Pager base="/scholarships" current={current} page={p.page} total={total} />}
      </div>
    </>
  );
}
