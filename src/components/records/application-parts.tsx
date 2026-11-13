import { Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, Pill, type Tone } from "@/components/ui-kit";
import { deadlineState, effectiveDeadline, statusGroup, statusLabel, type DeadlineState } from "@/lib/applications";
import { daysUntil, remaining } from "@/lib/dashboard-logic";
import { formatDateOnly } from "@/lib/time";

export const statusTone = (s: string): Tone => {
  if (s === "accepted") return "success";
  if (s === "rejected") return "danger";
  if (s === "waitlisted") return "warning";
  const g = statusGroup(s);
  return g === "submitted" ? "info" : g === "withdrawn" ? "neutral" : "brand";
};
export const StatusPill = ({ status }: { status: string }) => <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>;

const stateTone: Record<DeadlineState, Tone> = { overdue: "danger", due_soon: "warning", upcoming: "neutral", none: "neutral", closed: "neutral" };

/** One definition of the application deadline: override, else program, else Unknown; submitted/decided is never overdue. */
export function AppDeadline({ status, application, program, today, compact }: {
  status: string; application: string | null; program: string | null; today: string; compact?: boolean;
}) {
  const { date, source } = effectiveDeadline(application, program);
  if (!date) return <span className="text-muted-foreground">{deadlineState(status, null, today) === "closed" ? "No deadline" : "Deadline unknown"}</span>;
  const state = deadlineState(status, date, today);
  const n = daysUntil(date, today);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{formatDateOnly(date)}</span>
      {state !== "closed" && <Pill tone={stateTone[state]}>{state === "overdue" ? remaining(n) : state === "due_soon" ? `Due soon · ${remaining(n)}` : remaining(n)}</Pill>}
      {!compact && source === "application" && <span className="text-xs text-muted-foreground">(application deadline)</span>}
      {!compact && source === "program" && <span className="text-xs text-muted-foreground">(from program)</span>}
    </span>
  );
}

export function ProgressBar({ done, total, label = "Requirements" }: { done: number; total: number; label?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span><span className="tabular-nums">{total === 0 ? "None yet" : `${done}/${total} · ${pct}%`}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total === 0 ? undefined : pct} aria-valuetext={total === 0 ? "No requirements" : `${done} of ${total} complete`}
        className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Shown instead of the module when the Phase 6 migration has not been applied yet. */
export function SetupNotice() {
  return (
    <Card className="mt-6">
      <EmptyState icon={Database} title="One database step is pending">
        Application tracking needs the Phase 6 migration. Open <code>supabase/migrations/20261114000100_phase6_applications.sql</code>, paste it into the Supabase SQL Editor and run it, then reload this page.
      </EmptyState>
    </Card>
  );
}
