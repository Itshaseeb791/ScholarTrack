import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Files, GraduationCap, History, Link2, ListChecks, NotebookText, Pencil, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader, Pill } from "@/components/ui-kit";
import { AppDeadline, ProgressBar, SetupNotice, StatusPill } from "@/components/records/application-parts";
import { DeleteButton } from "@/components/records/delete-button";
import { selectClass } from "@/components/records/record-form";
import { RequirementsPanel } from "@/components/records/requirements-panel";
import { StatusChanger } from "@/components/records/status-changer";
import { BackLink, Detail, ExtLink, formatMoney, fundingLabel, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { canTransition, effectiveDeadline, requirementsProgress, SCHOLARSHIP_OUTCOMES, statusLabel, STATUSES } from "@/lib/applications";
import { deleteApplication, linkApplicationScholarship, setScholarshipOutcome, unlinkApplicationScholarship } from "@/lib/records/application-actions";
import { getApplicationBundle, hasPhase6 } from "@/lib/records/application-queries";
import { isUuid } from "@/lib/records/validate";
import { daysUntil, remaining } from "@/lib/dashboard-logic";
import { dateInZone, formatDateOnly, getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "Application · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase6(supabase))) return <SetupNotice />;
  const bundle = isUuid(id) ? await getApplicationBundle(supabase, id) : null;
  if (!bundle) notFound();
  const { app, requirements, history, linked, available } = bundle;
  const tz = getTimezone(), today = todayIn(tz);
  const allowed = STATUSES.filter((x) => canTransition(app.status, x[0]).ok).map((x) => [x[0], x[1]] as const);
  const fee = formatMoney(app.application_fee, app.currency);
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  const prog = requirementsProgress(requirements);
  const nextUp = requirements.filter((r) => !r.is_complete && r.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 3);
  const dl = effectiveDeadline(app.application_deadline, app.program_deadline);

  return (
    <>
      <BackLink href="/applications">Applications</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader icon={Files} title={app.university_name}>
          <Link href={`/programs/${app.program_id}`} className="help-text inline-flex items-center gap-1 hover:text-primary hover:underline"><GraduationCap className="size-3.5" aria-hidden="true" />{app.program_name}{app.intake ? ` · ${app.intake}` : ""}</Link>
        </PageHeader>
        <div className="flex flex-wrap gap-2">
          <StatusChanger applicationId={id} current={app.status} allowed={allowed} />
          <Link href={`/applications/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteApplication.bind(null, id)} noun="application" name={`${app.university_name} · ${app.program_name}`}
            impact={`This also deletes its ${requirements.length} requirement${requirements.length === 1 ? "" : "s"}, ${history.length} history entr${history.length === 1 ? "y" : "ies"} and ${linked.length} scholarship link${linked.length === 1 ? "" : "s"}. The university, program and scholarships are kept.`} />
        </div>
      </div>

      <Card className="mt-6"><CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2"><StatusPill status={app.status} />{!requirements.length ? null : <Pill tone={prog.remaining === 0 ? "success" : "neutral"}>{prog.done}/{prog.total} requirements</Pill>}</div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="University"><Link href={`/universities/${app.university_id}`} className="font-medium text-primary hover:underline">{app.university_name}</Link> <span className="text-muted-foreground">· {app.university_country}</span></Detail>
          <Detail label="Program"><Link href={`/programs/${app.program_id}`} className="font-medium text-primary hover:underline">{app.program_name}</Link></Detail>
          <Detail label="Application deadline"><AppDeadline status={app.status} application={app.application_deadline} program={app.program_deadline} today={today} /></Detail>
          <Detail label="Intake">{s(app.intake)}</Detail>
          <Detail label="Submission date">{app.submission_date ? formatDateOnly(app.submission_date) : null}</Detail>
          <Detail label="Decision date">{app.decision_date ? formatDateOnly(app.decision_date) : null}</Detail>
          <Detail label="Expected response">{app.expected_response_date ? formatDateOnly(app.expected_response_date) : null}</Detail>
          <Detail label="Reference number">{s(app.reference_number)}</Detail>
          <Detail label="Application fee">{fee}</Detail>
          <Detail label="Application portal"><ExtLink href={app.portal_url} /></Detail>
        </dl>
      </CardContent></Card>

      <Card className="mt-6">
        <CardHeader><h2 className="section-title">Progress</h2></CardHeader>
        <CardContent className="space-y-4">
          <ProgressBar done={prog.done} total={prog.total} />
          <div>
            <p className="eyebrow">Next up</p>
            {nextUp.length === 0 && !dl.date ? <p className="help-text mt-1">No dated items yet.</p> : (
              <ul className="mt-1 space-y-1 text-sm">
                {dl.date && <li className="flex flex-wrap items-center gap-2"><ArrowRight className="size-3.5 text-emerald" aria-hidden="true" />Application deadline <AppDeadline status={app.status} application={app.application_deadline} program={app.program_deadline} today={today} compact /></li>}
                {nextUp.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><ArrowRight className="size-3.5 text-emerald" aria-hidden="true" />{r.title} <span className="text-muted-foreground">· {formatDateOnly(r.due_date!)} · {remaining(daysUntil(r.due_date!, today))}</span></li>)}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><h2 className="section-title flex items-center gap-2"><ListChecks className="size-5 text-emerald" aria-hidden="true" />Requirements</h2></CardHeader>
        <CardContent><RequirementsPanel applicationId={id} items={requirements} today={today} /></CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><h2 className="section-title flex items-center gap-2"><GraduationCap className="size-5 text-emerald" aria-hidden="true" />Scholarships</h2></CardHeader>
        <CardContent className="space-y-4">
          {linked.length === 0 && <p className="help-text">No scholarship linked. That is fine if this application is self-funded.</p>}
          <ul className="divide-y">
            {linked.map((l) => {
              const sc = l.scholarships;
              return (
                <li key={l.scholarship_id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {sc ? <Link href={`/scholarships/${sc.id}`} className="font-medium text-primary hover:underline">{sc.name}</Link> : <span className="text-muted-foreground">Scholarship unavailable</span>}
                      {sc && <p className="help-text">{[s(sc.provider), fundingLabel(sc.funding_type) || null, sc.application_deadline ? `Deadline ${formatDateOnly(sc.application_deadline)}` : null].filter(Boolean).join(" · ")}</p>}
                    </div>
                    <form action={unlinkApplicationScholarship.bind(null, id, l.scholarship_id)}><Button type="submit" variant="ghost" className="h-11 sm:h-9" aria-label={`Unlink ${sc?.name ?? "scholarship"}`}><Unlink aria-hidden="true" />Unlink</Button></form>
                  </div>
                  <form action={setScholarshipOutcome.bind(null, id, l.scholarship_id)} className="flex gap-2">
                    <select name="outcome" aria-label={`Scholarship outcome for ${sc?.name ?? "scholarship"}`} defaultValue={l.outcome} className={selectClass}>
                      {SCHOLARSHIP_OUTCOMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    <Button type="submit" variant="outline" className="h-11 shrink-0 md:h-9">Save outcome</Button>
                  </form>
                </li>
              );
            })}
          </ul>
          {available.length > 0 && (
            <form action={linkApplicationScholarship.bind(null, id)} className="flex gap-2">
              <select name="target" aria-label="Scholarship to link" required defaultValue="" className={selectClass}>
                <option value="" disabled>Choose a scholarship…</option>
                {available.map((x) => <option key={x.id} value={x.id}>{x.name}{x.country ? ` (${x.country})` : ""}</option>)}
              </select>
              <Button type="submit" variant="outline" className="h-11 shrink-0 md:h-9"><Link2 aria-hidden="true" />Link</Button>
            </form>
          )}
          {available.length === 0 && linked.length === 0 && <p className="help-text">No scholarships saved yet. <Link href="/scholarships/new" className="font-medium text-primary underline">Add one</Link>.</p>}
          <p className="help-text">Scholarship outcomes are tracked separately from the admission status.</p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <details open className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-(--card-spacing) [&::-webkit-details-marker]:hidden"><History className="size-5 text-emerald" aria-hidden="true" /><h2 className="section-title">Activity</h2><span className="ml-auto text-xs text-muted-foreground group-open:hidden">Show</span></summary>
          <CardContent className="mt-3">
            {history.length === 0 ? <p className="help-text">No status changes recorded.</p> : (
              <ol className="relative space-y-4 border-l pl-5">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-emerald ring-4 ring-card" aria-hidden="true" />
                    <p className="text-sm font-medium">{h.from_status ? <>{statusLabel(h.from_status)} <ArrowRight className="inline size-3.5" aria-label="to" /> {statusLabel(h.to_status)}</> : <>Created as {statusLabel(h.to_status)}</>}</p>
                    <p className="text-xs text-muted-foreground"><time dateTime={h.changed_at}>{when.format(new Date(h.changed_at))}</time></p>
                    {h.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </details>
      </Card>

      <Card className="mt-6">
        <CardHeader><h2 className="section-title flex items-center gap-2"><NotebookText className="size-5 text-emerald" aria-hidden="true" />Notes</h2></CardHeader>
        <CardContent>
          {s(app.notes) ? <p className="whitespace-pre-wrap break-words text-sm">{app.notes}</p> : <p className="help-text">No notes. Use Edit to add some.</p>}
          <p className="help-text mt-3">Last updated {when.format(new Date(app.updated_at))} · created {formatDateOnly(dateInZone(app.created_at, tz))}</p>
        </CardContent>
      </Card>
    </>
  );
}
