import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ItemLink } from "@/components/records/planning-parts";
import { SetupNotice } from "@/components/records/application-parts";
import { DayAdd, DayList, Legend, MonthGrid, Toolbar } from "@/components/records/calendar-parts";
import { requireOwner } from "@/lib/auth/session";
import { groupByDay, monthGrid, parseDay, parseView, periodLabel, rangeFor, shiftPeriod } from "@/lib/calendar";
import { hasPhase7, loadCalendarItems } from "@/lib/records/planning-queries";
import { first, type RawParams } from "@/lib/records/params";
import { addDays, formatDateOnly, getTimezone, startOfWeek, todayIn } from "@/lib/time";

export const metadata = { title: "Calendar · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const raw = await searchParams;
  if (!(await hasPhase7(supabase))) return <><PageHeader icon={CalendarDays} title="Calendar" /><SetupNotice what="The calendar" file="20261115000100_phase7_planning.sql" /></>;
  const tz = getTimezone(), today = todayIn(tz);
  const view = parseView(first(raw.view));
  const date = parseDay(first(raw.date), today);
  const range = rangeFor(view, date);
  const sel = (() => { const s = parseDay(first(raw.sel), date); return s >= range.from && s <= range.to ? s : date; })();
  // Only the displayed range is fetched (bounded, indexed per source).
  const items = await loadCalendarItems(supabase, range.from, range.to, tz);
  const map = groupByDay(items, range.from, range.to);
  const prev = shiftPeriod(view, date, -1), next = shiftPeriod(view, date, 1);
  const total = items.length;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={CalendarDays} title="Calendar"><p className="help-text">{total} item{total === 1 ? "" : "s"} in view</p></PageHeader>
        <Link href={`/calendar/events/new?date=${sel}`} className={buttonVariants({ className: "h-11 shrink-0 sm:h-9" })}>Add event</Link>
      </div>
      <div className="mt-6 space-y-4">
        <Toolbar view={view} date={date} sel={sel} label={periodLabel(view, date)} prev={prev} next={next} today={today} />
        <Legend />

        {view === "month" && (() => {
          const g = monthGrid(date);
          return (
            <>
              <MonthGrid weeks={g.weeks} month={g.month} sel={sel} today={today} map={map} date={date} />
              <div className="space-y-3"><DayList day={sel} items={map.get(sel) ?? []} today={today} /><DayAdd day={sel} /></div>
            </>
          );
        })()}

        {view === "week" && (
          <div className="grid gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)).map((d) => (
              <Card key={d} className={`gap-2 p-2 ${d === today ? "ring-2 ring-primary/40" : ""}`}>
                <Link href={`/calendar?view=day&date=${d}`} className="px-1 text-sm font-semibold hover:text-primary">{formatDateOnly(d, { weekday: "short", day: "numeric", month: "short" })}{d === today && <span className="ml-1 text-xs text-primary">Today</span>}</Link>
                {(map.get(d) ?? []).length === 0 ? <p className="help-text px-1">Nothing scheduled.</p> : (
                  <ul className="divide-y">{(map.get(d) ?? []).map((i) => <li key={i.id}><ItemLink item={i} today={today} showDate={false} /></li>)}</ul>
                )}
              </Card>
            ))}
          </div>
        )}

        {view === "day" && <div className="space-y-3"><DayList day={date} items={map.get(date) ?? []} today={today} /><DayAdd day={date} /></div>}

        {view === "agenda" && (
          <div className="space-y-5">
            {[...map].filter(([, l]) => l.length > 0).map(([d, l]) => <DayList key={d} day={d} items={l} today={today} />)}
            {total === 0 && <Card className="p-6 text-center"><p className="font-medium">Nothing in the next 30 days</p><p className="help-text mt-1">Deadlines, tasks and events will appear here as you add them.</p><div className="mt-4 flex justify-center"><DayAdd day={today} /></div></Card>}
          </div>
        )}
      </div>
    </>
  );
}
