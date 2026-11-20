import Link from "next/link";
import { Bell } from "lucide-react";
import { getOwnerSession } from "@/lib/auth/session";
import { hasPhase7, loadReminders } from "@/lib/records/planning-queries";
import { reminderState } from "@/lib/reminders";
import { getTimezone } from "@/lib/time";

export function BellLink({ count = 0 }: { count?: number }) {
  return (
    <Link href="/reminders" aria-label={count > 0 ? `Reminders, ${count} due` : "Reminders"} data-reminder-count={count}
      className="relative grid size-11 place-items-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent">
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white" aria-hidden="true">{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}

/** Streams in behind <Suspense> so the static shell never waits on the database. Layout revalidation refreshes it after any write. */
export async function ReminderBell() {
  const session = await getOwnerSession();
  if (!session || !(await hasPhase7(session.supabase))) return <BellLink />;
  let count = 0;
  try {
    const tz = getTimezone(), now = new Date();
    count = (await loadReminders(session.supabase, tz)).filter((r) => reminderState(r, now, tz) === "due").length;
  } catch { count = 0; } // the bell must never take the page down
  return <BellLink count={count} />;
}
