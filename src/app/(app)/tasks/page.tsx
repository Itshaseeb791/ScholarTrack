import Link from "next/link";
import { CheckSquare, Files } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { FilterBar } from "@/components/records/filter-bar";
import { DueChip, hhmm, PriorityPill } from "@/components/records/planning-parts";
import { SetupNotice } from "@/components/records/application-parts";
import { TaskCheck } from "@/components/records/task-check";
import { AddButton, Pager } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_VIEWS, parseTaskView, taskState } from "@/lib/tasks";
import { applicationOptions, hasPhase7, listTasks, TASK_FILTERS, TASK_SORTS, taskTabCounts } from "@/lib/records/planning-queries";
import { buildHref, hasActiveFilters, parseListParams, type RawParams } from "@/lib/records/params";
import { getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Tasks · Scholarship Tracker" };
const TAB_LABEL: Record<string, string> = { all: "All", today: "Today", upcoming: "Upcoming", overdue: "Overdue", completed: "Completed" };
const EMPTY: Record<string, string> = { today: "Nothing due today.", upcoming: "No upcoming tasks.", overdue: "No overdue tasks. You are on top of it.", completed: "No completed tasks yet." };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const raw = await searchParams;
  if (!(await hasPhase7(supabase))) return <><PageHeader icon={CheckSquare} title="Tasks" /><SetupNotice what="Tasks" file="20261115000100_phase7_planning.sql" /></>;
  const today = todayIn(getTimezone());
  const view = parseTaskView(Array.isArray(raw.view) ? raw.view[0] : raw.view);
  const p = parseListParams(raw, TASK_SORTS, TASK_FILTERS);
  const [{ rows, total }, counts, apps] = await Promise.all([listTasks(supabase, p, view, today), taskTabCounts(supabase, today), applicationOptions(supabase)]);
  const current: Record<string, string> = { ...(view !== "all" && { view }), ...(p.q && { q: p.q }), ...p.filters, ...(p.sort !== TASK_SORTS[0] && { sort: p.sort }) };
  const { view: _v, ...withoutView } = current; void _v;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={CheckSquare} title="Tasks"><p className="help-text">{counts.overdue > 0 ? `${counts.overdue} overdue · ` : ""}{counts.today} due today</p></PageHeader>
        <AddButton href="/tasks/new">Add task</AddButton>
      </div>
      <nav aria-label="Task views" className="mt-6 flex gap-1 overflow-x-auto pb-1">
        {TASK_VIEWS.map((v) => (
          <Link key={v} href={buildHref("/tasks", withoutView, { view: v === "all" ? null : v })} aria-current={view === v ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${view === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {TAB_LABEL[v]}<span className={`tabular-nums ${view === v ? "" : "text-muted-foreground"}`}>{counts[v]}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        <FilterBar current={current} placeholder="Search tasks"
          filters={[
            { name: "priority", label: "Priority", options: TASK_PRIORITIES },
            { name: "status", label: "Status", options: TASK_STATUSES },
            { name: "application", label: "Application", options: apps },
          ]}
          sorts={[["due", "Due date (soonest)"], ["recent", "Recently added"], ["updated", "Recently updated"]]} />
      </div>
      <div className="mt-5">
        {rows.length === 0 ? (
          <Card>
            {counts.all === 0 ? (
              <EmptyState icon={CheckSquare} title="Create your first task">Track things like asking for recommendation letters or booking an English test.<AddButton href="/tasks/new">Add task</AddButton></EmptyState>
            ) : (
              <EmptyState icon={CheckSquare} title={hasActiveFilters(p) ? "No tasks match your search" : EMPTY[view] ?? "No tasks here"}>
                {hasActiveFilters(p) ? <>Try a different search or <Link href={buildHref("/tasks", view === "all" ? {} : { view }, {})} className="font-medium text-primary underline">clear the filters</Link>.</> : null}
              </EmptyState>
            )}
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((t) => {
                const st = taskState(t, today);
                return (
                  <li key={t.id} className="flex items-center gap-1 pl-1 pr-3">
                    <TaskCheck id={t.id} title={t.title} status={t.status} />
                    <Link href={`/tasks/${t.id}`} className="flex min-h-14 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="min-w-0 flex-1 basis-44">
                        <span className={`block truncate text-sm font-medium ${st === "completed" || st === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <PriorityPill priority={t.priority} />
                          {t.app_label && <span className="inline-flex items-center gap-1 truncate"><Files className="size-3" aria-hidden="true" />{t.app_label}</span>}
                        </span>
                      </span>
                      <span className="text-sm">
                        <DueChip date={t.due_date} today={today} closed={st === "completed" || st === "cancelled"} />{hhmm(t.due_time) && <span className="ml-1 text-muted-foreground">{hhmm(t.due_time)}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {total > 0 && <Pager base="/tasks" current={current} page={p.page} total={total} />}
      </div>
    </>
  );
}
