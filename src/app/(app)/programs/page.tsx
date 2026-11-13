import Link from "next/link";
import { GraduationCap, School } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { FilterBar } from "@/components/records/filter-bar";
import { AddButton, Deadline, Empty, Pager, degreeLabel, formatMoney } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { distinct, FILTERS, listPrograms, SORTS, universityOptions } from "@/lib/records/queries";
import { hasActiveFilters, parseListParams, type RawParams } from "@/lib/records/params";
import { DEGREE_TYPES } from "@/lib/records/validate";
import { getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Programs · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const p = parseListParams(await searchParams, SORTS.programs, FILTERS.programs);
  const today = todayIn(getTimezone());
  const [{ rows, total }, countries, unis] = await Promise.all([listPrograms(supabase, p), distinct(supabase, "universities", "country"), universityOptions(supabase)]);
  const current: Record<string, string> = { ...(p.q && { q: p.q }), ...p.filters, ...(p.sort !== SORTS.programs[0] && { sort: p.sort }) };
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={GraduationCap} title="Programs"><p className="help-text">{total} saved</p></PageHeader>
        <AddButton href="/programs/new">Add program</AddButton>
      </div>
      <div className="mt-6">
        <FilterBar current={current} placeholder="Search program or field of study"
          filters={[
            { name: "university", label: "University", options: unis.map((u) => [u.id, u.name] as const) },
            { name: "country", label: "Country", options: countries.map((c) => [c, c] as const) },
            { name: "degree", label: "Degree", options: DEGREE_TYPES },
          ]}
          sorts={[["deadline", "Deadline (soonest)"], ["name", "Name A–Z"], ["recent", "Recently added"]]} />
      </div>
      <div className="mt-5">
        {rows.length === 0 ? <Empty filtered={hasActiveFilters(p)} icon={GraduationCap} noun="programs" addHref="/programs/new" addLabel="Add program" /> : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/programs/${r.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate font-medium">{String(r.name)}</p>
                      <p className="help-text flex items-center gap-1 truncate"><School className="size-3.5 shrink-0" aria-hidden="true" />{r.universities.name} · {r.universities.country}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Pill tone="info">{degreeLabel(r.degree_type)}</Pill>
                      {formatMoney(r.tuition_fee, r.currency) && <span className="text-muted-foreground">{formatMoney(r.tuition_fee, r.currency)}</span>}
                      <Deadline date={r.application_deadline} today={today} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {total > 0 && <Pager base="/programs" current={current} page={p.page} total={total} />}
      </div>
    </>
  );
}
