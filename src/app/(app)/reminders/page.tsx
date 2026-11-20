import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pill } from "@/components/ui-kit";
import { SetupNotice } from "@/components/records/application-parts";
import { describeWhen, STATE_META } from "@/components/records/reminder-panel";
import { ReminderButtons } from "@/components/records/reminder-controls";
import { requireOwner } from "@/lib/auth/session";
import { reminderState, SOURCE_TYPES, type ReminderState } from "@/lib/reminders";
import { hasPhase7, loadReminders, type ReminderRecord } from "@/lib/records/planning-queries";
import { getTimezone } from "@/lib/time";

export const metadata = { title: "Reminders · Scholarship Tracker" };
const SOURCE_LABEL: Record<(typeof SOURCE_TYPES)[number], string> = { task: "Task", event: "Event", application: "Application", scholarship: "Scholarship", program: "Program", requirement: "Requirement" };

export default async function Page() {
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return <><PageHeader icon={Bell} title="Reminders" /><SetupNotice what="Reminders" file="20261115000100_phase7_planning.sql" /></>;
  const tz = getTimezone(), now = new Date();
  const list = (await loadReminders(supabase, tz)).map((r) => ({ r, st: reminderState(r, now, tz) }));
  const by = (...s: ReminderState[]) => list.filter((x) => s.includes(x.st));
  const sections: { key: string; title: string; hint: string; rows: typeof list }[] = [
    { key: "due", title: "Due now", hint: "These are due. Mark done when you have dealt with them, or dismiss.", rows: by("due") },
    { key: "upcoming", title: "Upcoming", hint: "Scheduled, or waiting for the item to get a date.", rows: by("scheduled", "no_date").sort((a, b) => (a.r.sourceDate ?? "9999").localeCompare(b.r.sourceDate ?? "9999")) },
    { key: "done", title: "Done and dismissed", hint: "Restore one to bring it back.", rows: by("acknowledged", "dismissed") },
    { key: "inactive", title: "Disabled or finished", hint: "Disabled by you, or the item is finished (completed task, submitted application, passed deadline).", rows: by("disabled", "closed", "orphan") },
  ];
  const due = sections[0].rows.length;
  return (
    <>
      <PageHeader icon={Bell} title="Reminders"><p className="help-text">{due > 0 ? `${due} due now` : "Nothing due right now"} · {list.length} total</p></PageHeader>
      <p className="help-text mt-3">Add reminders from a task, event, application, scholarship or program page. A reminder shows here when it is due; it stays until you mark it done or dismiss it.</p>
      {list.length === 0 ? (
        <Card className="mt-6"><EmptyState icon={BellOff} title="No reminders yet">Open a task, scholarship, application or event and add one, or use the suggested reminders.<Link href="/deadlines" className="mt-3 font-medium text-primary underline">Browse deadlines</Link></EmptyState></Card>
      ) : (
        <div className="mt-6 space-y-6">
          {sections.filter((s) => s.rows.length > 0).map((s) => (
            <section key={s.key} aria-labelledby={`rem-${s.key}`} data-section={s.key}>
              <h2 id={`rem-${s.key}`} className="flex items-center gap-2 text-sm font-semibold">{s.title}<Pill tone={s.key === "due" ? "warning" : "neutral"}>{s.rows.length}</Pill></h2>
              <p className="help-text mb-2">{s.hint}</p>
              <Card className="gap-0 py-0">
                <ul className="divide-y">
                  {s.rows.map(({ r, st }: { r: ReminderRecord; st: ReminderState }) => (
                    <li key={r.id} className="space-y-2 px-4 py-3" data-reminder={r.id}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 flex-1 basis-48">
                          {r.href ? <Link href={r.href} className="block truncate text-sm font-medium text-primary hover:underline">{r.sourceTitle}</Link> : <span className="text-sm text-muted-foreground">Item no longer available</span>}
                          <span className="text-xs text-muted-foreground">{r.sourceType ? SOURCE_LABEL[r.sourceType] : "Reminder"} · {describeWhen(r, tz)}</span>
                        </span>
                        <Pill tone={STATE_META[st].tone}>{STATE_META[st].label}</Pill>
                      </div>
                      <ReminderButtons id={r.id} state={st} enabled={r.enabled} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
