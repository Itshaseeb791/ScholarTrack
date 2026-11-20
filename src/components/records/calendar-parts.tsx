import Link from "next/link";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toneClass } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { VIEWS, type View } from "@/lib/calendar";
import { KIND_LABEL, KIND_ORDER, type DeadlineItem } from "@/lib/deadlines";
import { buildHref } from "@/lib/records/params";
import { formatDateOnly } from "@/lib/time";
import { ItemLink, KIND_META } from "./planning-parts";

const dotClass = { brand: "bg-emerald", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", neutral: "bg-muted-foreground" } as const;
const VIEW_LABEL: Record<View, string> = { month: "Month", week: "Week", day: "Day", agenda: "Agenda" };
const dayName = (d: string, o: Intl.DateTimeFormatOptions) => formatDateOnly(d, o);

export function Toolbar({ view, date, sel, label, prev, next, today }: { view: View; date: string; sel: string; label: string; prev: string; next: string; today: string }) {
  const href = (patch: Record<string, string | null>) => buildHref("/calendar", { view, date }, patch);
  const noun = view === "agenda" ? "30 days" : view;
  const btn = buttonVariants({ variant: "outline", size: "icon", className: "size-11 sm:size-9" });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ date: prev, sel: null })} aria-label={`Previous ${noun}`} className={btn}><ChevronLeft aria-hidden="true" /></Link>
        <Link href={href({ date: next, sel: null })} aria-label={`Next ${noun}`} className={btn}><ChevronRight aria-hidden="true" /></Link>
        <Link href={href({ date: today, sel: null })} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}>Today</Link>
        <h2 className="section-title ml-1 min-w-0 flex-1 truncate" aria-live="polite">{label}</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Calendar view" className="flex gap-1">
          {VIEWS.map((v) => (
            <Link key={v} href={buildHref("/calendar", { date }, { view: v, sel: null })} aria-current={v === view ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-9 ${v === view ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{VIEW_LABEL[v]}</Link>
          ))}
        </nav>
        <form action="/calendar" method="get" className="flex items-center gap-1.5" aria-label="Jump to date">
          <input type="hidden" name="view" value={view} />
          <input type="date" name="date" defaultValue={sel} aria-label="Jump to date" className="h-11 rounded-lg border border-input bg-card px-2 text-base sm:h-9 sm:text-sm" />
          <button type="submit" className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}>Go</button>
        </form>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {KIND_ORDER.map((k) => { const { icon: I, tone } = KIND_META[k]; return <li key={k} className="inline-flex items-center gap-1"><span className={`grid size-5 place-items-center rounded-full ${toneClass[tone]}`}><I className="size-3" aria-hidden="true" /></span>{KIND_LABEL[k]}</li>; })}
    </ul>
  );
}

export function MonthGrid({ weeks, month, sel, today, map, date }: { weeks: string[][]; month: string; sel: string; today: string; map: Map<string, DeadlineItem[]>; date: string }) {
  return (
    <div role="grid" aria-label="Month" className="overflow-hidden rounded-xl border bg-card">
      <div role="row" className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
        {weeks[0].map((d) => <div key={d} role="columnheader" className="py-2">{dayName(d, { weekday: "short" })}</div>)}
      </div>
      {weeks.map((w) => (
        <div key={w[0]} role="row" className="grid grid-cols-7 border-b last:border-b-0">
          {w.map((d) => {
            const items = map.get(d) ?? [], inMonth = d.startsWith(month), isToday = d === today, isSel = d === sel;
            return (
              <Link key={d} role="gridcell" href={buildHref("/calendar", { view: "month", date }, { sel: d })} data-day={d} aria-current={isToday ? "date" : undefined} aria-selected={isSel}
                aria-label={`${dayName(d, { weekday: "long", day: "numeric", month: "long" })}, ${items.length} item${items.length === 1 ? "" : "s"}`}
                className={`flex min-h-14 flex-col gap-1 border-r p-1 outline-none last:border-r-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset md:min-h-28 md:p-1.5 ${isSel ? "bg-accent" : "hover:bg-muted"} ${inMonth ? "" : "text-muted-foreground/60"}`}>
                <span className={`grid size-6 place-items-center self-start rounded-full text-xs font-semibold tabular-nums ${isToday ? "bg-primary text-primary-foreground" : ""}`}>{Number(d.slice(8))}</span>
                <span className="flex flex-wrap gap-0.5 md:hidden" aria-hidden="true">
                  {items.slice(0, 4).map((i) => <span key={i.id} className={`size-1.5 rounded-full ${dotClass[KIND_META[i.kind].tone]}`} />)}
                </span>
                <span className="hidden min-w-0 flex-col gap-0.5 md:flex" aria-hidden="true">
                  {items.slice(0, 3).map((i) => { const { icon: I, tone } = KIND_META[i.kind]; return <span key={i.id} className={`flex items-center gap-1 truncate rounded px-1 text-[11px] leading-5 ${toneClass[tone]} ${i.done ? "line-through opacity-60" : ""}`}><I className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{i.time ? `${i.time} ` : ""}{i.title}</span></span>; })}
                  {items.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">+{items.length - 3} more</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DayAdd({ day }: { day: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/tasks/new?date=${day}`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><CheckSquare aria-hidden="true" />Add task</Link>
      <Link href={`/calendar/events/new?date=${day}`} className={buttonVariants({ className: "h-11 sm:h-9" })}><Plus aria-hidden="true" /><CalendarDays aria-hidden="true" />Add event</Link>
    </div>
  );
}

export function DayList({ day, items, today, heading = true }: { day: string; items: DeadlineItem[]; today: string; heading?: boolean }) {
  return (
    <section aria-label={dayName(day, { weekday: "long", day: "numeric", month: "long" })} data-day-list={day}>
      {heading && <h3 className="mb-1 text-sm font-semibold">{dayName(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{day === today && <span className="ml-2 text-xs font-medium text-primary">Today</span>}</h3>}
      {items.length === 0 ? <p className="help-text px-1 py-2">Nothing scheduled.</p> : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">{items.map((i) => <li key={i.id}><ItemLink item={i} today={today} showDate={false} /></li>)}</ul>
      )}
    </section>
  );
}
