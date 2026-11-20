import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, getTimezone, todayIn } from "./time";
import { buildDeadlines, buildStats, groupTasks, IN_PROGRESS, type Row } from "./dashboard-logic";

export type RecentApplication = {
  id: string; status: string; submission_date: string | null;
  programs: { name: string; universities: { name: string } | null } | null;
  application_scholarships: { scholarships: { name: string } | null }[];
};

// ponytail: per-source fetch caps (20/50) keep the page light; raise or paginate if you track more.
export async function loadDashboard(db: SupabaseClient) {
  const timeZone = getTimezone();
  const today = todayIn(timeZone);
  // Events are timestamps: fetch from the previous UTC day so no local-day event is missed, then filter by local day.
  const eventsFrom = addDays(today, -1);
  const [uni, sch, apps, programs, scholarships, tasks, events, recent] = await Promise.all([
    db.from("universities").select("id", { count: "exact", head: true }),
    db.from("scholarships").select("id", { count: "exact", head: true }),
    db.from("applications").select("status,program_id"),
    db.from("programs").select("id,name,application_deadline").gte("application_deadline", today).order("application_deadline").limit(20),
    db.from("scholarships").select("id,name,application_deadline").gte("application_deadline", today).order("application_deadline").limit(20),
    db.from("tasks").select("id,title,due_date,priority,status").in("status", ["todo", "in_progress"]).order("due_date", { nullsFirst: false }).limit(50),
    db.from("events").select("id,title,starts_at").gte("starts_at", eventsFrom).order("starts_at").limit(20),
    db.from("applications")
      .select("id,status,submission_date,programs(name,universities(name)),application_scholarships(scholarships(name))")
      .order("created_at", { ascending: false }).limit(5),
  ]);
  // Phase 6 data. These queries tolerate a missing migration (the view/table are then absent): the dashboard
  // simply falls back to program deadlines instead of failing.
  const [pending, allDay, reqs] = await Promise.all([
    db.from("application_overview").select("id,program_id,status,program_name,university_name,effective_deadline").in("status", [...IN_PROGRESS]).limit(100),
    // All-day events (Phase 7) use date-only columns; the query fails harmlessly before the migration.
    db.from("events").select("id,title,all_day,start_date,end_date").eq("all_day", true).gte("start_date", today).order("start_date").limit(20),
    db.from("application_requirements").select("id,title,due_date,application_id").eq("is_complete", false).not("due_date", "is", null).gte("due_date", today).order("due_date").limit(50),
  ]);
  const failed = [uni, sch, apps, programs, scholarships, tasks, events, recent].find((r) => r.error);
  if (failed) throw new Error("Dashboard query failed: " + failed.error!.code);

  const taskRows = (tasks.data ?? []) as Row[];
  const deadlines = buildDeadlines({
    programs: (programs.data ?? []) as Row[], scholarships: (scholarships.data ?? []) as Row[],
    tasks: taskRows, events: [...(events.data ?? []), ...(allDay.error ? [] : allDay.data ?? [])] as Row[],
    applications: pending.error ? [] : (pending.data ?? []) as Row[], requirements: reqs.error ? [] : (reqs.data ?? []) as Row[],
    // Only hide a program deadline when its application deadline is actually available (Phase 6 migration applied).
    coveredPrograms: pending.error ? [] : (apps.data ?? []).map((a) => a.program_id as string),
  }, today, timeZone);
  const statusCounts: Record<string, number> = {};
  for (const a of apps.data ?? []) statusCounts[a.status as string] = (statusCounts[a.status as string] ?? 0) + 1;
  return {
    today, deadlines, statusCounts,
    stats: buildStats((apps.data ?? []).map((a) => a.status as string), uni.count ?? 0, sch.count ?? 0, deadlines, today),
    tasks: groupTasks(taskRows, today),
    recent: (recent.data ?? []) as unknown as RecentApplication[],
  };
}
