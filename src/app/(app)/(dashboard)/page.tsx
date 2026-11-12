import Link from "next/link";
import { CalendarClock, Files, GraduationCap, Hourglass, Inbox, ListChecks, School, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, IconTile, PageHeader, Pill, type Tone } from "@/components/ui-kit";
import { requireOwner } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/dashboard";
import { daysUntil, label, remaining, urgency, type Row } from "@/lib/dashboard-logic";
import { formatDateOnly } from "@/lib/time";

const urgencyTone: Record<ReturnType<typeof urgency>, Tone> = { overdue: "danger", urgent: "warning", normal: "neutral" };
const statusTone = (s: string): Tone =>
  s === "accepted" ? "success" : s === "rejected" ? "danger" : ["submitted", "under_review", "interview"].includes(s) ? "info"
    : s === "withdrawn" ? "neutral" : "brand";
const dateChip = { overdue: "bg-danger-soft text-danger", urgent: "bg-warning-soft text-warning", normal: "bg-accent text-accent-foreground" };

function SectionTitle({ icon: Icon, children, count }: { icon: typeof CalendarClock; children: React.ReactNode; count?: number }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <Icon className="size-5 text-emerald" aria-hidden="true" />
      <h2 className="section-title">{children}</h2>
      {count !== undefined && count > 0 && <span className="ml-auto"><Pill tone="brand">{count}</Pill></span>}
    </CardTitle>
  );
}

function TaskList({ title, tone, tasks, today, empty }: { title: string; tone: Tone; tasks: Row[]; today: string; empty: string }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{title}<Pill tone={tasks.length ? tone : "neutral"}>{tasks.length}</Pill></h3>
      {tasks.length === 0 ? <p className="help-text">{empty}</p> : (
        <ul className="space-y-1">
          {tasks.slice(0, 5).map((t) => {
            const d = t.due_date ? daysUntil(t.due_date, today) : null;
            return (
              <li key={t.id} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm odd:bg-muted/50">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${t.priority === "high" ? "bg-danger" : t.priority === "medium" ? "bg-warning" : "bg-emerald"}`} aria-hidden="true" />
                  <span className="truncate">{t.title}</span>
                </span>
                {d !== null && <Pill tone={urgencyTone[urgency(d)]}>{remaining(d)}</Pill>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default async function Page() {
  const { supabase } = await requireOwner();
  const { today, stats, deadlines, tasks, recent } = await loadDashboard(supabase);
  const cards = [
    { name: "Universities", value: stats.universities, icon: School, tone: "brand" },
    { name: "Scholarships", value: stats.scholarships, icon: GraduationCap, tone: "brand" },
    { name: "Applications", value: stats.applications, icon: Files, tone: "brand" },
    { name: "In progress", value: stats.inProgress, icon: Hourglass, tone: "info" },
    { name: "Submitted", value: stats.submitted, icon: Send, tone: "success" },
    { name: "Due in 30 days", value: stats.upcoming, icon: CalendarClock, tone: "warning" },
  ] as const;
  return (
    <>
      <PageHeader title="Dashboard">
        <p className="help-text">{formatDateOnly(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </PageHeader>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map(({ name, value, icon, tone }) => (
          <div key={name} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3.5 shadow-[0_1px_2px_rgb(22_61_42/0.05)] sm:p-4">
            <IconTile icon={icon} tone={tone} className="size-10 sm:size-11" />
            <div className="min-w-0"><dt className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{name}</dt><dd className="stat-value">{value}</dd></div>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><SectionTitle icon={CalendarClock} count={deadlines.length}>Upcoming deadlines</SectionTitle></CardHeader>
          <CardContent>
            {deadlines.length === 0 ? <EmptyState icon={CalendarClock} title="No deadlines yet">Program, scholarship, task and event dates will appear here.</EmptyState> : (
              <ul className="divide-y">
                {deadlines.slice(0, 8).map((d) => {
                  const n = daysUntil(d.date, today);
                  const u = urgency(n);
                  return (
                    <li key={d.id}>
                      <Link href={d.href} className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent">
                        <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-center leading-none ${dateChip[u]}`}>
                          <span><span className="block text-base font-semibold tabular-nums">{formatDateOnly(d.date, { day: "numeric" })}</span><span className="block text-[10px] font-medium uppercase">{formatDateOnly(d.date, { month: "short" })}</span></span>
                        </span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title}</span>
                          <span className="text-xs text-muted-foreground">{d.source} · {formatDateOnly(d.date)}</span></span>
                        <Pill tone={urgencyTone[u]}>{remaining(n)}</Pill>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><SectionTitle icon={ListChecks}>Tasks</SectionTitle></CardHeader>
          <CardContent className="space-y-5">
            <TaskList title="Overdue" tone="danger" tasks={tasks.overdue} today={today} empty="Nothing overdue." />
            <TaskList title="Due today" tone="warning" tasks={tasks.today} today={today} empty="Nothing due today." />
            <TaskList title="High priority" tone="danger" tasks={tasks.high} today={today} empty="No high-priority tasks." />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><SectionTitle icon={Files}>Recent applications</SectionTitle></CardHeader>
          <CardContent>
            {recent.length === 0 ? <EmptyState icon={Inbox} title="No applications yet">Applications you start will show up here.</EmptyState> : (
              <ul className="divide-y">
                {recent.map((a) => {
                  const names = a.application_scholarships.map((s) => s.scholarships?.name).filter(Boolean);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <IconTile icon={School} className="size-10" />
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.programs?.universities?.name ?? "Unknown university"}</span>
                          <span className="block truncate text-xs text-muted-foreground">{a.programs?.name ?? "Unknown program"}{names.length > 0 && ` · ${names.join(", ")}`}</span></span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Pill tone={statusTone(a.status)}>{label(a.status)}</Pill>
                        {a.submission_date && <span>Submitted {formatDateOnly(a.submission_date)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
