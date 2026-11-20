import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, GraduationCap, Pencil, School } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { DeleteButton } from "@/components/records/delete-button";
import { BackLink, Deadline, Detail, ExtLink, degreeLabel, formatMoney, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { deleteProgram } from "@/lib/records/actions";
import { hasExtras } from "@/lib/records/queries";
import { hasPhase6 } from "@/lib/records/application-queries";
import { hasPhase7, remindersFor } from "@/lib/records/planning-queries";
import { ReminderPanel } from "@/components/records/reminder-panel";
import { AddButton } from "@/components/records/parts";
import { StatusPill } from "@/components/records/application-parts";
import { isUuid } from "@/lib/records/validate";
import { getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Program · Scholarship Tracker" };

type Linked = { scholarships: { id: string; name: string; application_deadline: string | null } | null }[];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const { data: p } = isUuid(id)
    ? await supabase.from("programs").select("*, universities(id,name,country,city)").eq("id", id).maybeSingle()
    : { data: null };
  if (!p) notFound();
  const today = todayIn(getTimezone());
  const extras = await hasExtras(supabase);
  const phase6 = await hasPhase6(supabase);
  const phase7 = await hasPhase7(supabase);
  const reminders = phase7 ? await remindersFor(supabase, "program", id, getTimezone()) : [];
  const appRows = phase6 ? ((await supabase.from("application_overview").select("id,status,intake,effective_deadline").eq("program_id", id).order("created_at", { ascending: false }).limit(20)).data ?? []) : [];
  const [{ count: apps }, links] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true }).eq("program_id", id),
    extras ? supabase.from("scholarship_programs").select("scholarships(id,name,application_deadline)").eq("program_id", id) : Promise.resolve({ data: [] }),
  ]);
  const schols = ((links.data ?? []) as unknown as Linked).flatMap((l) => (l.scholarships ? [l.scholarships] : []));
  const uni = p.universities as { id: string; name: string; country: string; city: string | null } | null;
  return (
    <>
      <BackLink href="/programs">Programs</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader icon={GraduationCap} title={p.name}>
          {uni && <Link href={`/universities/${uni.id}`} className="help-text inline-flex items-center gap-1 hover:text-primary hover:underline"><School className="size-3.5" aria-hidden="true" />{uni.name}, {uni.country}</Link>}
        </PageHeader>
        <div className="flex gap-2">
          <Link href={`/programs/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteProgram.bind(null, id)} noun="program" name={p.name} impact={schols.length ? "Its scholarship links will be removed too." : "This cannot be undone."}
            blocked={apps ? `This program has ${apps} application${apps > 1 ? "s" : ""}. Remove them first so no application data is lost by accident.` : undefined} />
        </div>
      </div>
      <Card className="mt-6"><CardContent>
        <div className="mb-4 flex flex-wrap gap-2"><Pill tone="info">{degreeLabel(p.degree_type)}</Pill>{s(p.intake) && <Pill tone="brand">{p.intake}</Pill>}</div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Application deadline"><Deadline date={p.application_deadline} today={today} /></Detail>
          <Detail label="Tuition fee">{formatMoney(p.tuition_fee, p.currency)}</Detail>
          <Detail label="Field of study">{s(p.field_of_study)}</Detail><Detail label="Duration">{s(p.duration)}</Detail>
          <Detail label="Official program page" wide><ExtLink href={p.official_url} /></Detail>
          <Detail label="Admission & language requirements" wide>{s(p.requirements)}</Detail>
        </dl>
      </CardContent></Card>
      {phase6 && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between"><h2 className="section-title">Applications <Pill tone="brand">{appRows.length}</Pill></h2><AddButton href={`/applications/new?program=${id}`}>Apply to this program</AddButton></CardHeader>
          <CardContent>
            {appRows.length === 0 ? <p className="help-text">No application yet. Start one to track status, requirements and scholarships.</p> : (
              <ul className="divide-y">{appRows.map((a) => (
                <li key={a.id}><Link href={`/applications/${a.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-primary"><span className="flex items-center gap-2 font-medium"><StatusPill status={a.status} />{a.intake ?? "Application"}</span><span className="text-sm"><Deadline date={a.effective_deadline} today={today} /></span></Link></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
      )}
      {phase7 && (
        <Card className="mt-6">
          <CardHeader><h2 className="section-title flex items-center gap-2"><Bell className="size-5 text-emerald" aria-hidden="true" />Reminders</h2></CardHeader>
          <CardContent><ReminderPanel type="program" sourceId={id} reminders={reminders} tz={getTimezone()} hasDate={!!p.application_deadline} /></CardContent>
        </Card>
      )}
      <Card className="mt-6"><CardHeader><h2 className="section-title">Linked scholarships</h2></CardHeader><CardContent>
        {schols.length === 0 ? <p className="help-text">{extras ? "No scholarships linked. Link one from the scholarship page." : "Scholarship linking becomes available after the Phase 5 database migration is applied."}</p> : (
          <ul className="divide-y">{schols.map((x) => (
            <li key={x.id}><Link href={`/scholarships/${x.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-primary"><span className="font-medium">{x.name}</span><span className="text-sm"><Deadline date={x.application_deadline} today={today} /></span></Link></li>
          ))}</ul>
        )}
      </CardContent></Card>
    </>
  );
}
