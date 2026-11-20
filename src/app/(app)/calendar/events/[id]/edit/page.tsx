import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-kit";
import { RecordForm } from "@/components/records/record-form";
import { SetupNotice } from "@/components/records/application-parts";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveEvent } from "@/lib/records/planning-actions";
import { applicationOptions, hasPhase7 } from "@/lib/records/planning-queries";
import { eventFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";
import { dateInZone, getTimezone, timeInZone } from "@/lib/time";

export const metadata = { title: "Edit event · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return <SetupNotice what="Events" file="20261115000100_phase7_planning.sql" />;
  const tz = getTimezone();
  const [{ data: ev }, apps] = await Promise.all([isUuid(id) ? supabase.from("events").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }), applicationOptions(supabase)]);
  if (!ev) notFound();
  const initial: Record<string, string> = {
    title: ev.title, event_type: ev.event_type === "other" ? "" : ev.event_type, location: ev.location ?? "", meeting_url: ev.meeting_url ?? "", notes: ev.notes ?? "", application_id: ev.application_id ?? "",
  };
  if (ev.all_day) Object.assign(initial, { all_day: "on", start_date: ev.start_date, end_date: ev.end_date ?? "" });
  else {
    const sd = dateInZone(ev.starts_at, tz);
    initial.start_date = sd; initial.start_time = timeInZone(ev.starts_at, tz);
    if (ev.ends_at) { const ed = dateInZone(ev.ends_at, tz); initial.end_time = timeInZone(ev.ends_at, tz); if (ed !== sd) initial.end_date = ed; }
  }
  return (
    <>
      <BackLink href={`/calendar/events/${id}`}>{ev.title}</BackLink>
      <PageHeader icon={CalendarDays} title="Edit event" />
      <Card className="mt-6"><CardContent><RecordForm fields={eventFields(apps)} action={saveEvent.bind(null, id)} initial={initial} cancelHref={`/calendar/events/${id}`} submitLabel="Save changes" /></CardContent></Card>
    </>
  );
}
