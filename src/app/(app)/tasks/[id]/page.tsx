import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, CheckSquare, Files, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { SetupNotice } from "@/components/records/application-parts";
import { DeleteButton } from "@/components/records/delete-button";
import { hhmm, PriorityPill, TaskStatePill } from "@/components/records/planning-parts";
import { selectClass } from "@/components/records/record-form";
import { ReminderPanel } from "@/components/records/reminder-panel";
import { TaskCheck } from "@/components/records/task-check";
import { BackLink, Detail, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { TASK_STATUSES, taskStatusLabel } from "@/lib/tasks";
import { changeTaskStatus, deleteTask } from "@/lib/records/planning-actions";
import { getTask, hasPhase7, remindersFor } from "@/lib/records/planning-queries";
import { isUuid } from "@/lib/records/validate";
import { formatDateOnly, getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Task · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return <SetupNotice what="Tasks" file="20261115000100_phase7_planning.sql" />;
  const tz = getTimezone(), today = todayIn(tz);
  const task = isUuid(id) ? await getTask(supabase, id) : null;
  if (!task) notFound();
  const reminders = await remindersFor(supabase, "task", id, tz);
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  return (
    <>
      <BackLink href="/tasks">Tasks</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <TaskCheck id={id} title={task.title} status={task.status} />
          <PageHeader icon={CheckSquare} title={task.title} />
        </div>
        <div className="flex gap-2">
          <Link href={`/tasks/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteTask.bind(null, id)} noun="task" name={task.title} impact={`${reminders.length ? `Its ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} will be removed too. ` : ""}The related application is not affected.`} />
        </div>
      </div>

      <Card className="mt-6"><CardContent>
        <div className="mb-4 flex flex-wrap gap-2"><TaskStatePill status={task.status} due={task.due_date} today={today} /><PriorityPill priority={task.priority} /><Pill tone="neutral">{taskStatusLabel(task.status)}</Pill></div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Due">{task.due_date ? `${formatDateOnly(task.due_date)}${hhmm(task.due_time) ? ` at ${hhmm(task.due_time)}` : ""}` : null}</Detail>
          <Detail label="Completed">{task.completed_at ? when.format(new Date(task.completed_at)) : null}</Detail>
          <Detail label="Related application" wide>{task.application_id ? <Link href={`/applications/${task.application_id}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><Files className="size-4" aria-hidden="true" />{task.app_label ?? "Application"}</Link> : null}</Detail>
          <Detail label="Description" wide>{s(task.description)}</Detail>
        </dl>
        <form action={changeTaskStatus.bind(null, id)} className="mt-5 flex gap-2" aria-label="Change status">
          <select name="status" aria-label="Task status" defaultValue={task.status} className={selectClass}>{TASK_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <Button type="submit" variant="outline" className="h-11 shrink-0 md:h-9">Save status</Button>
        </form>
      </CardContent></Card>

      <Card className="mt-6">
        <CardHeader><h2 className="section-title flex items-center gap-2"><Bell className="size-5 text-emerald" aria-hidden="true" />Reminders</h2></CardHeader>
        <CardContent><ReminderPanel type="task" sourceId={id} reminders={reminders} tz={tz} hasDate={!!task.due_date} /></CardContent>
      </Card>
    </>
  );
}
