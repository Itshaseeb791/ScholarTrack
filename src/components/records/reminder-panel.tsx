import Link from "next/link";
import { Bell } from "lucide-react";
import { Pill, type Tone } from "@/components/ui-kit";
import { missingOffsets, offsetLabel, reminderState, SUGGESTED_OFFSETS, triggerDay, type ReminderState, type SourceType } from "@/lib/reminders";
import type { ReminderRecord } from "@/lib/records/planning-queries";
import { formatDateOnly } from "@/lib/time";
import { AddReminderForm, ReminderButtons, SuggestButton } from "./reminder-controls";

export const STATE_META: Record<ReminderState, { label: string; tone: Tone }> = {
  due: { label: "Due now", tone: "warning" }, scheduled: { label: "Scheduled", tone: "info" }, acknowledged: { label: "Done", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" }, disabled: { label: "Disabled", tone: "neutral" }, closed: { label: "Source finished", tone: "neutral" },
  no_date: { label: "Waiting for a date", tone: "neutral" }, orphan: { label: "Source missing", tone: "danger" },
};

export function describeWhen(r: ReminderRecord, tz: string) {
  const day = triggerDay(r, tz);
  if (r.offset_days === null) return r.remind_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(r.remind_at)) : "Custom time";
  return day ? `${offsetLabel(r.offset_days)} · ${formatDateOnly(day)}` : `${offsetLabel(r.offset_days)} · date not set yet`;
}

export function ReminderPanel({ type, sourceId, reminders, sources, tz, hasDate = true }: {
  type: SourceType; sourceId: string; reminders: ReminderRecord[]; sources?: { type: SourceType; id: string; label: string }[]; tz: string; hasDate?: boolean;
}) {
  const now = new Date();
  const wanted = SUGGESTED_OFFSETS[type];
  const todo = missingOffsets(reminders.filter((r) => r.sourceType === type && r.source_id === sourceId).map((r) => r.offset_days), wanted);
  const label = (n: number) => (n === 1 ? "1 day" : `${n} days`);
  return (
    <div className="space-y-3">
      {reminders.length === 0 ? <p className="help-text">No reminders yet.{!hasDate && " This item has no date, so day-based reminders will wait until you set one."}</p> : (
        <ul className="divide-y">
          {reminders.map((r) => {
            const st = reminderState(r, now, tz), meta = STATE_META[st];
            return (
              <li key={r.id} className="space-y-1.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Bell className="size-4 text-emerald" aria-hidden="true" />
                  <span className="font-medium">{describeWhen(r, tz)}</span><Pill tone={meta.tone}>{meta.label}</Pill>
                  {r.sourceType && r.source_id !== sourceId && r.href && <Link href={r.href} className="text-xs text-primary hover:underline">{r.sourceTitle}</Link>}
                </div>
                <ReminderButtons id={r.id} state={st} enabled={r.enabled} compact />
              </li>
            );
          })}
        </ul>
      )}
      {todo.length > 0 && hasDate && <SuggestButton type={type} sourceId={sourceId} label={`Suggested: ${todo.map(label).join(" + ")} before`} />}
      <AddReminderForm sources={sources ?? [{ type, id: sourceId, label: "This item" }]} />
      <p className="help-text">Reminders appear in the Reminder Center and the bell in the header. They follow the item&apos;s date if it changes.</p>
    </div>
  );
}
