import Link from "next/link";
import { CalendarDays, CheckSquare, Clock, Files, GraduationCap, ListChecks, School } from "lucide-react";
import { Pill, toneClass, type Tone } from "@/components/ui-kit";
import { KIND_LABEL, urgencyOf, type DeadlineItem, type Kind } from "@/lib/deadlines";
import { daysUntil, remaining } from "@/lib/dashboard-logic";
import { priorityLabel, taskState, type TaskState } from "@/lib/tasks";
import { formatDateOnly } from "@/lib/time";

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
/** Each kind has an icon AND a text label, so nothing relies on colour alone. */
export const KIND_META: Record<Kind, { icon: Icon; tone: Tone }> = {
  application: { icon: Files, tone: "warning" }, requirement: { icon: ListChecks, tone: "info" }, scholarship: { icon: GraduationCap, tone: "success" },
  program: { icon: School, tone: "brand" }, task: { icon: CheckSquare, tone: "neutral" }, event: { icon: CalendarDays, tone: "danger" },
};

export function KindBadge({ kind, short }: { kind: Kind; short?: boolean }) {
  const { icon: Icon, tone } = KIND_META[kind];
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}><Icon className="size-3.5" aria-hidden="true" />{short ? KIND_LABEL[kind].split(" ")[0] : KIND_LABEL[kind]}</span>;
}

export const priorityTone = (p: string): Tone => (p === "urgent" ? "danger" : p === "high" ? "warning" : p === "low" ? "neutral" : "info");
export const PriorityPill = ({ priority }: { priority: string }) => <Pill tone={priorityTone(priority)}>{priorityLabel(priority)}</Pill>;

const stateTone: Record<TaskState, Tone> = { completed: "success", cancelled: "neutral", overdue: "danger", today: "warning", upcoming: "neutral", no_date: "neutral" };
const stateText: Record<TaskState, string> = { completed: "Completed", cancelled: "Cancelled", overdue: "Overdue", today: "Due today", upcoming: "Upcoming", no_date: "No date" };
export const TaskStatePill = ({ status, due, today }: { status: string; due: string | null; today: string }) => {
  const st = taskState({ status, due_date: due }, today);
  return <Pill tone={stateTone[st]}>{stateText[st]}</Pill>;
};

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Date + countdown chip used by lists. Unknown dates are never "overdue". */
export function DueChip({ date, today, closed }: { date: string | null; today: string; closed?: boolean }) {
  if (!date) return <span className="text-muted-foreground">No date</span>;
  if (closed) return <span>{formatDateOnly(date)}</span>;
  const u = urgencyOf(date, today), n = daysUntil(date, today);
  const tone: Tone = u === "overdue" ? "danger" : u === "due_soon" ? "warning" : "neutral";
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><span>{formatDateOnly(date)}</span><Pill tone={tone}>{remaining(n)}</Pill></span>;
}

export function ItemLink({ item, today, showDate = true }: { item: DeadlineItem; today: string; showDate?: boolean }) {
  return (
    <Link href={item.href} className={`flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent ${item.done ? "opacity-60" : ""}`}>
      <span className="min-w-0 flex-1 basis-48">
        <span className={`block truncate text-sm font-medium ${item.done ? "line-through" : ""}`}>{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <KindBadge kind={item.kind} />
          {item.time && <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />{item.time}{item.endTime ? `–${item.endTime}` : ""}</span>}
          {item.subtitle && <span className="truncate">{item.subtitle}</span>}
        </span>
      </span>
      {showDate && <span className="text-sm"><DueChip date={item.date} today={today} closed={item.done || item.kind === "event"} /></span>}
    </Link>
  );
}
