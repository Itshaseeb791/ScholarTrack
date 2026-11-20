import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateInZone, timeInZone } from "./time";
import { reminderState } from "./reminders";
import { hasPhase7, loadReminders, type ReminderRecord } from "./records/planning-queries";
import type { Deadline } from "./dashboard-logic";

export type NextEvent = { id: string; title: string; date: string; time: string | null; allDay: boolean; location: string | null };

/** Phase 7 dashboard extras. Everything here is optional: before the migration it returns an empty result. */
export async function loadPlanning(db: SupabaseClient, today: string, tz: string, deadlines: Deadline[]) {
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, count: deadlines.filter((d) => d.date === date).length };
  });
  const empty = { enabled: false, dueReminders: [] as ReminderRecord[], dueCount: 0, nextEvent: null as NextEvent | null, week };
  if (!(await hasPhase7(db))) return empty;
  const now = new Date();
  const [reminders, timed, allDay] = await Promise.all([
    loadReminders(db, tz).catch(() => [] as ReminderRecord[]),
    db.from("events").select("id,title,starts_at,ends_at,location").eq("all_day", false).gte("starts_at", now.toISOString()).order("starts_at").limit(1),
    db.from("events").select("id,title,start_date,end_date,location").eq("all_day", true).gte("start_date", today).order("start_date").limit(1),
  ]);
  const due = reminders.filter((r) => reminderState(r, now, tz) === "due");
  const cands: NextEvent[] = [];
  for (const e of timed.data ?? []) cands.push({ id: e.id, title: e.title, date: dateInZone(e.starts_at, tz), time: timeInZone(e.starts_at, tz), allDay: false, location: e.location });
  for (const e of allDay.data ?? []) cands.push({ id: e.id, title: e.title, date: e.start_date, time: null, allDay: true, location: e.location });
  cands.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  return { enabled: true, dueReminders: due.slice(0, 4), dueCount: due.length, nextEvent: cands[0] ?? null, week };
}
