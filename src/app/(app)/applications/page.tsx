import Link from "next/link";
import { Files, School } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-kit";
import { FilterBar } from "@/components/records/filter-bar";
import { AppDeadline, ProgressBar, SetupNotice, StatusPill } from "@/components/records/application-parts";
import { AddButton, Empty, Pager } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { STATUSES } from "@/lib/applications";
import { APP_FILTERS, APP_SORTS, hasPhase6, listApplications, overviewOptions } from "@/lib/records/application-queries";
import { hasActiveFilters, parseListParams, type RawParams } from "@/lib/records/params";
import { dateInZone, formatDateOnly, getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Applications · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const raw = await searchParams;
  if (!(await hasPhase6(supabase))) {
    return <><PageHeader icon={Files} title="Applications" /><SetupNotice /></>;
  }
  const tz = getTimezone(), today = todayIn(tz);
  const p = parseListParams(raw, APP_SORTS, APP_FILTERS);
  const [{ rows, total }, opts] = await Promise.all([listApplications(supabase, p, today), overviewOptions(supabase)]);
  const current: Record<string, string> = { ...(p.q && { q: p.q }), ...p.filters, ...(p.sort !== APP_SORTS[0] && { sort: p.sort }) };
  const cols = "md:grid md:grid-cols-[minmax(0,2.2fr)_9rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem] md:items-center md:gap-4";
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={Files} title="Applications"><p className="help-text">{total} tracked</p></PageHeader>
        <AddButton href="/applications/new">Add application</AddButton>
      </div>
      <div className="mt-6">
        <FilterBar current={current} placeholder="Search university, program or reference"
          filters={[
            { name: "status", label: "Status", options: STATUSES },
            { name: "country", label: "Country", options: opts.countries.map((c) => [c, c] as const) },
            { name: "university", label: "University", options: opts.universities.map(([id, n]) => [id, n] as const) },
            { name: "intake", label: "Intake", options: opts.intakes.map((i) => [i, i] as const) },
            { name: "deadline", label: "Deadline", options: [["open", "Upcoming"], ["30", "Next 30 days"], ["past", "Passed"], ["none", "No deadline"]] },
          ]}
          sorts={[["deadline", "Deadline (soonest)"], ["updated", "Recently updated"], ["created", "Recently added"], ["university", "University A–Z"]]} />
      </div>
      <div className="mt-5">
        {rows.length === 0 ? <Empty filtered={hasActiveFilters(p)} icon={Files} noun="applications" addHref="/applications/new" addLabel="Add application" /> : (
          <Card className="gap-0 py-0">
            <div className={`hidden border-b px-4 py-2.5 eyebrow ${cols}`} aria-hidden="true">
              <span>University / program</span><span>Status</span><span>Deadline</span><span>Requirements</span><span>Updated</span>
            </div>
            <ul className="divide-y">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} className={`flex min-h-16 flex-col gap-2 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent ${cols}`}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 truncate font-medium"><School className="size-4 shrink-0 text-emerald" aria-hidden="true" /><span className="truncate">{a.university_name}</span></span>
                      <span className="block truncate text-sm text-muted-foreground">{a.program_name}{a.intake ? ` · ${a.intake}` : ""}</span>
                    </span>
                    <span><StatusPill status={a.status} /></span>
                    <span className="text-sm"><AppDeadline status={a.status} application={a.application_deadline} program={a.program_deadline} today={today} compact /></span>
                    <ProgressBar done={a.requirements_done} total={a.requirements_total} label="Requirements" />
                    <span className="text-xs text-muted-foreground md:text-sm">Updated {formatDateOnly(dateInZone(a.updated_at, tz), { day: "numeric", month: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {total > 0 && <Pager base="/applications" current={current} page={p.page} total={total} />}
      </div>
    </>
  );
}
