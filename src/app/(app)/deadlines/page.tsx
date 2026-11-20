import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader, Pill, type Tone } from "@/components/ui-kit";
import { SetupNotice } from "@/components/records/application-parts";
import { ItemLink } from "@/components/records/planning-parts";
import { selectClass } from "@/components/records/record-form";
import { requireOwner } from "@/lib/auth/session";
import { classify, countGroups, groupDeadlines, GROUPS, KIND_LABEL, KIND_ORDER, type DeadlineItem, type Group, type Kind } from "@/lib/deadlines";
import { applicationOptions, hasPhase7, loadCenterItems } from "@/lib/records/planning-queries";
import { first, type RawParams } from "@/lib/records/params";
import { getTimezone, isDateOnly, todayIn } from "@/lib/time";

export const metadata = { title: "Deadlines · Scholarship Tracker" };
const TONE: Record<Group, Tone> = { overdue: "danger", today: "warning", next7: "warning", next30: "info", later: "neutral", none: "neutral" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const raw = await searchParams;
  if (!(await hasPhase7(supabase))) return <><PageHeader icon={CalendarClock} title="Deadlines" /><SetupNotice what="The Deadline Center" file="20261115000100_phase7_planning.sql" /></>;
  const tz = getTimezone(), today = todayIn(tz);
  const [all, apps] = await Promise.all([loadCenterItems(supabase, today, tz), applicationOptions(supabase)]);

  const type = first(raw.type), country = first(raw.country), application = first(raw.application), urgency = first(raw.urgency);
  const from = isDateOnly(first(raw.from)) ? first(raw.from) : "", to = isDateOnly(first(raw.to)) ? first(raw.to) : "";
  const order = first(raw.sort) === "overdue-first" ? "overdue-first" : "soonest";
  const countries = [...new Set(all.map((i) => i.country).filter((c): c is string => !!c))].sort();
  const filtered: DeadlineItem[] = all.filter((i) =>
    (!type || i.kind === type) && (!country || i.country === country) && (!application || i.applicationId === application)
    && (!urgency || classify(i.date, today) === urgency) && (!from || (i.date !== null && i.date >= from)) && (!to || (i.date !== null && i.date <= to)));
  const groups = groupDeadlines(filtered, today, order);
  const shown = countGroups(groups);
  const active = Boolean(type || country || application || urgency || from || to);
  // Default: nearest upcoming first, overdue after the upcoming groups. "Overdue first" puts it on top.
  const keys: Group[] = order === "overdue-first" ? ["overdue", "today", "next7", "next30", "later", "none"] : ["today", "next7", "next30", "later", "overdue", "none"];
  const groupOrder = keys.map((k) => GROUPS.find((g) => g.key === k)!);

  return (
    <>
      <PageHeader icon={CalendarClock} title="Deadlines"><p className="help-text">{shown} open item{shown === 1 ? "" : "s"}{groups.overdue.length > 0 ? ` · ${groups.overdue.length} overdue` : ""}</p></PageHeader>
      <ul aria-label="Summary" className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {GROUPS.map((g) => (
          <li key={g.key}><a href={`#g-${g.key}`} className="flex min-h-14 flex-col items-center justify-center rounded-xl border bg-card px-1 py-2 text-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="stat-value text-xl sm:text-2xl">{groups[g.key].length}</span><span className="text-[11px] text-muted-foreground sm:text-xs">{g.label}</span></a></li>
        ))}
      </ul>

      <form method="get" action="/deadlines" aria-label="Filter deadlines" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <select name="type" aria-label="Type" defaultValue={type} className={selectClass}><option value="">Type: all</option>{KIND_ORDER.map((k: Kind) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <select name="urgency" aria-label="Urgency" defaultValue={urgency} className={selectClass}><option value="">Urgency: all</option>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
        <select name="country" aria-label="Country" defaultValue={country} className={selectClass}><option value="">Country: all</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select name="application" aria-label="Application" defaultValue={application} className={selectClass}><option value="">Application: all</option>{apps.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        <input type="date" name="from" aria-label="From date" defaultValue={from} className="h-10 rounded-lg border border-input bg-card px-2 text-base md:h-9 md:text-sm" />
        <input type="date" name="to" aria-label="To date" defaultValue={to} className="h-10 rounded-lg border border-input bg-card px-2 text-base md:h-9 md:text-sm" />
        <select name="sort" aria-label="Sort" defaultValue={order} className={selectClass}><option value="soonest">Sort: soonest first</option><option value="overdue-first">Sort: overdue first</option></select>
        <div className="flex gap-2"><button type="submit" className={buttonVariants({ className: "h-10 flex-1 md:h-9" })}>Apply</button>{active && <Link href="/deadlines" className={buttonVariants({ variant: "outline", className: "h-10 md:h-9" })}>Clear</Link>}</div>
      </form>

      <div className="mt-6 space-y-6">
        {shown === 0 ? (
          <Card><EmptyState icon={CalendarClock} title={active ? "No deadlines match your filters" : "No open deadlines"}>{active ? "Try different filters or clear them." : "Program, scholarship, application, requirement and task dates will be collected here."}</EmptyState></Card>
        ) : groupOrder.filter((g) => groups[g.key].length > 0).map((g) => (
          <section key={g.key} id={`g-${g.key}`} aria-labelledby={`h-${g.key}`} className="scroll-mt-20">
            <h2 id={`h-${g.key}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">{g.label}<Pill tone={TONE[g.key]}>{groups[g.key].length}</Pill></h2>
            <Card className="gap-0 py-0"><ul className="divide-y">{groups[g.key].map((i) => <li key={i.id}><ItemLink item={i} today={today} /></li>)}</ul></Card>
          </section>
        ))}
      </div>
    </>
  );
}
