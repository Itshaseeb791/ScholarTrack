import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, CalendarDays, Files, Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { SetupNotice } from "@/components/records/application-parts";
import { DeleteButton } from "@/components/records/delete-button";
import { ReminderPanel } from "@/components/records/reminder-panel";
import { BackLink, Detail, ExtLink, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { eventTypeLabel } from "@/lib/events";
import { deleteEvent } from "@/lib/records/planning-actions";
import { hasPhase7, remindersFor } from "@/lib/records/planning-queries";
import { isUuid } from "@/lib/records/validate";
import { dateInZone, formatDateOnly, getTimezone, timeInZone } from "@/lib/time";

export const metadata = { title: "Event · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return <SetupNotice what="Events" file="20261115000100_phase7_planning.sql" />;
  const tz = getTimezone();
  const { data: ev } = isUuid(id) ? await supabase.from("events").select("*, applications(id, programs(name, universities(name)))").eq("id", id).maybeSingle() : { data: null };
  if (!ev) notFound();
  const reminders = await remindersFor(supabase, "event", id, tz);
  const app = Array.isArray(ev.applications) ? ev.applications[0] : ev.applications;
  const prog = Array.isArray(app?.programs) ? app.programs[0] : app?.programs;
  const uni = Array.isArray(prog?.universities) ? prog.universities[0] : prog?.universities;
  const appLabel = app ? [uni?.name, prog?.name].filter(Boolean).join(" · ") || "Application" : null;

  let when: string;
  if (ev.all_day) when = `${formatDateOnly(ev.start_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${ev.end_date ? ` – ${formatDateOnly(ev.end_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}` : ""} · all day`;
  else {
    const sd = dateInZone(ev.starts_at, tz), ed = ev.ends_at ? dateInZone(ev.ends_at, tz) : null;
    when = `${formatDateOnly(sd, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}, ${timeInZone(ev.starts_at, tz)}`;
    if (ev.ends_at) when += ed === sd ? `–${timeInZone(ev.ends_at, tz)}` : ` → ${formatDateOnly(ed!, { day: "numeric", month: "short" })}, ${timeInZone(ev.ends_at, tz)}`;
  }
  return (
    <>
      <BackLink href={`/calendar?view=month&date=${ev.all_day ? ev.start_date : dateInZone(ev.starts_at, tz)}`}>Calendar</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader icon={CalendarDays} title={ev.title}><p className="help-text">{when}</p></PageHeader>
        <div className="flex gap-2">
          <Link href={`/calendar/events/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteEvent.bind(null, id)} noun="event" name={ev.title} impact={`${reminders.length ? `Its ${reminders.length} reminder${reminders.length === 1 ? "" : "s"} will be removed too. ` : ""}The related application is not affected.`} />
        </div>
      </div>
      <Card className="mt-6"><CardContent>
        <div className="mb-4 flex flex-wrap gap-2"><Pill tone="danger">{eventTypeLabel(ev.event_type)}</Pill>{ev.all_day && <Pill tone="neutral">All day</Pill>}</div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="When" wide>{when}</Detail>
          <Detail label="Location">{s(ev.location)}</Detail>
          <Detail label="Meeting link"><ExtLink href={ev.meeting_url} /></Detail>
          <Detail label="Related application" wide>{app ? <Link href={`/applications/${app.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><Files className="size-4" aria-hidden="true" />{appLabel}</Link> : null}</Detail>
          <Detail label="Notes" wide>{s(ev.notes)}</Detail>
        </dl>
      </CardContent></Card>
      <Card className="mt-6">
        <CardHeader><h2 className="section-title flex items-center gap-2"><Bell className="size-5 text-emerald" aria-hidden="true" />Reminders</h2></CardHeader>
        <CardContent><ReminderPanel type="event" sourceId={id} reminders={reminders} tz={tz} /></CardContent>
      </Card>
    </>
  );
}
