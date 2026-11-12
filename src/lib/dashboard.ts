import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, getTimezone, todayIn } from "./time";
import { buildDeadlines, buildStats, groupTasks, type Row } from "./dashboard-logic";

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
    db.from("applications").select("status"),
    db.from("programs").select("id,name,application_deadline").gte("application_deadline", today).order("application_deadline").limit(20),
    db.from("scholarships").select("id,name,application_deadline").gte("application_deadline", today).order("application_deadline").limit(20),
    db.from("tasks").select("id,title,due_date,priority,status").in("status", ["todo", "in_progress"]).order("due_date", { nullsFirst: false }).limit(50),
    db.from("events").select("id,title,starts_at").gte("starts_at", eventsFrom).order("starts_at").limit(20),
    db.from("applications")
      .select("id,status,submission_date,programs(name,universities(name)),application_scholarships(scholarships(name))")
      .order("created_at", { ascending: false }).limit(5),
  ]);
  const failed = [uni, sch, apps, programs, scholarships, tasks, events, recent].find((r) => r.error);
  if (failed) throw new Error("Dashboard query failed: " + failed.error!.code);

  const taskRows = (tasks.data ?? []) as Row[];
  const deadlines = buildDeadlines({
    programs: (programs.data ?? []) as Row[], scholarships: (scholarships.data ?? []) as Row[],
    tasks: taskRows, events: (events.data ?? []) as Row[],
  }, today, timeZone);
  return {
    today, deadlines,
    stats: buildStats((apps.data ?? []).map((a) => a.status as string), uni.count ?? 0, sch.count ?? 0, deadlines, today),
    tasks: groupTasks(taskRows, today),
    recent: (recent.data ?? []) as unknown as RecentApplication[],
  };
}
