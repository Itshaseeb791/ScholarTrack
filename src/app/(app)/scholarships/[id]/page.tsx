import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, GraduationCap, Pencil, School, Unlink, Link2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { DeleteButton } from "@/components/records/delete-button";
import { selectClass } from "@/components/records/record-form";
import { BackLink, Deadline, Detail, ExtLink, formatMoney, fundingLabel, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { deleteScholarship, linkScholarship, unlinkScholarship } from "@/lib/records/actions";
import { hasExtras, universityOptions } from "@/lib/records/queries";
import { hasPhase7, remindersFor } from "@/lib/records/planning-queries";
import { ReminderPanel } from "@/components/records/reminder-panel";
import { isUuid } from "@/lib/records/validate";
import { formatDateOnly, getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Scholarship · Scholarship Tracker" };

type ProgLink = { programs: { id: string; name: string; universities: { name: string } | null } | null }[];
type UniLink = { universities: { id: string; name: string; country: string } | null }[];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const { data: r } = isUuid(id) ? await supabase.from("scholarships").select("*").eq("id", id).maybeSingle() : { data: null };
  if (!r) notFound();
  const today = todayIn(getTimezone());
  const extras = await hasExtras(supabase);
  const [{ count: apps }, pl, ul, allPrograms, allUnis] = await Promise.all([
    supabase.from("application_scholarships").select("application_id", { count: "exact", head: true }).eq("scholarship_id", id),
    extras ? supabase.from("scholarship_programs").select("programs(id,name,universities(name))").eq("scholarship_id", id) : Promise.resolve({ data: [] }),
    extras ? supabase.from("scholarship_universities").select("universities(id,name,country)").eq("scholarship_id", id) : Promise.resolve({ data: [] }),
    extras ? supabase.from("programs").select("id,name,universities(name)").order("name").limit(500) : Promise.resolve({ data: [] }),
    extras ? universityOptions(supabase) : Promise.resolve([]),
  ]);
  const programs = ((pl.data ?? []) as unknown as ProgLink).flatMap((l) => (l.programs ? [l.programs] : []));
  const unis = ((ul.data ?? []) as unknown as UniLink).flatMap((l) => (l.universities ? [l.universities] : []));
  const freeProgs = ((allPrograms.data ?? []) as unknown as { id: string; name: string; universities: { name: string } | null }[]).filter((p) => !programs.some((x) => x.id === p.id));
  const freeUnis = allUnis.filter((u) => !unis.some((x) => x.id === u.id));
  const money = formatMoney(r.funding_amount, r.currency);
  const phase7 = await hasPhase7(supabase);
  const reminders = phase7 ? await remindersFor(supabase, "scholarship", id, getTimezone()) : [];

  return (
    <>
      <BackLink href="/scholarships">Scholarships</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader icon={GraduationCap} title={r.name}>{s(r.provider) && <p className="help-text">{r.provider}</p>}</PageHeader>
        <div className="flex gap-2">
          <Link href={`/scholarships/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteScholarship.bind(null, id)} noun="scholarship" name={r.name} impact={programs.length + unis.length ? "Its program and university links will be removed too." : "This cannot be undone."}
            blocked={apps ? `This scholarship is attached to ${apps} application${apps > 1 ? "s" : ""}. Detach it there first so no application data is lost by accident.` : undefined} />
        </div>
      </div>

      <Card className="mt-6"><CardContent>
        <div className="mb-4 flex flex-wrap gap-2">{s(r.funding_type) && <Pill tone={r.funding_type === "full" ? "success" : "info"}>{fundingLabel(r.funding_type)}</Pill>}{s(r.country) && <Pill tone="neutral">{r.country}</Pill>}</div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Application deadline"><Deadline date={r.application_deadline} today={today} /></Detail>
          <Detail label="Funding amount">{money}</Detail>
          {s(r.opening_date) && <Detail label="Opens">{formatDateOnly(r.opening_date)}</Detail>}
          <Detail label="Official website / application" wide><ExtLink href={r.official_url} /></Detail>
          <Detail label="Eligibility, requirements & documents" wide>{s(r.eligibility_requirements)}</Detail>
          <Detail label="Notes" wide>{s(r.notes)}</Detail>
        </dl>
      </CardContent></Card>

      {phase7 && (
        <Card className="mt-6">
          <CardHeader><h2 className="section-title flex items-center gap-2"><Bell className="size-5 text-emerald" aria-hidden="true" />Reminders</h2></CardHeader>
          <CardContent><ReminderPanel type="scholarship" sourceId={id} reminders={reminders} tz={getTimezone()} hasDate={!!r.application_deadline} /></CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader><h2 className="section-title">Related programs &amp; universities</h2></CardHeader>
        <CardContent className="space-y-5">
          {!extras ? (
            <p className="help-text">Linking scholarships to programs and universities needs the Phase 5 database migration (<code>20261113000100_phase5_relationships.sql</code>). Until it is applied, this scholarship is independent of any university.</p>
          ) : (
            <>
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><GraduationCap className="size-4 text-emerald" aria-hidden="true" />Programs</h3>
                {programs.length === 0 && <p className="help-text">Not linked to any program.</p>}
                <ul className="divide-y">{programs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link href={`/programs/${p.id}`} className="min-h-11 flex-1 py-2.5 hover:text-primary"><span className="font-medium">{p.name}</span><span className="help-text"> · {p.universities?.name}</span></Link>
                    <form action={unlinkScholarship.bind(null, id, "program", p.id)}><Button type="submit" variant="ghost" className="h-11 sm:h-9" aria-label={`Unlink ${p.name}`}><Unlink aria-hidden="true" />Unlink</Button></form>
                  </li>))}</ul>
                {freeProgs.length > 0 && (
                  <form action={linkScholarship.bind(null, id, "program")} className="mt-3 flex gap-2">
                    <select name="target" aria-label="Program to link" required className={selectClass} defaultValue=""><option value="" disabled>Choose a program…</option>{freeProgs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.universities?.name})</option>)}</select>
                    <Button type="submit" variant="outline" className="h-10 shrink-0"><Link2 aria-hidden="true" />Link</Button>
                  </form>
                )}
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><School className="size-4 text-emerald" aria-hidden="true" />Universities</h3>
                {unis.length === 0 && <p className="help-text">Available independently of any university.</p>}
                <ul className="divide-y">{unis.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <Link href={`/universities/${u.id}`} className="min-h-11 flex-1 py-2.5 hover:text-primary"><span className="font-medium">{u.name}</span><span className="help-text"> · {u.country}</span></Link>
                    <form action={unlinkScholarship.bind(null, id, "university", u.id)}><Button type="submit" variant="ghost" className="h-11 sm:h-9" aria-label={`Unlink ${u.name}`}><Unlink aria-hidden="true" />Unlink</Button></form>
                  </li>))}</ul>
                {freeUnis.length > 0 && (
                  <form action={linkScholarship.bind(null, id, "university")} className="mt-3 flex gap-2">
                    <select name="target" aria-label="University to link" required className={selectClass} defaultValue=""><option value="" disabled>Choose a university…</option>{freeUnis.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.country})</option>)}</select>
                    <Button type="submit" variant="outline" className="h-10 shrink-0"><Link2 aria-hidden="true" />Link</Button>
                  </form>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
