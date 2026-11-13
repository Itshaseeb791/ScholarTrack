import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap, Pencil, School, Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Pill } from "@/components/ui-kit";
import { DeleteButton } from "@/components/records/delete-button";
import { AddButton, BackLink, Deadline, Detail, ExtLink, formatMoney, degreeLabel, s } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { deleteUniversity } from "@/lib/records/actions";
import { getRow, hasExtras } from "@/lib/records/queries";
import { isUuid } from "@/lib/records/validate";
import { getTimezone, todayIn } from "@/lib/time";

export const metadata = { title: "University · Scholarship Tracker" };

type Linked = { scholarships: { id: string; name: string; application_deadline: string | null } | null }[];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const u = isUuid(id) ? await getRow(supabase, "universities", id) : null;
  if (!u) notFound();
  const extras = await hasExtras(supabase);
  const today = todayIn(getTimezone());
  const [{ data: programs }, links] = await Promise.all([
    supabase.from("programs").select("id,name,degree_type,application_deadline,tuition_fee,currency").eq("university_id", id).order("application_deadline", { nullsFirst: false }).order("name"),
    extras ? supabase.from("scholarship_universities").select("scholarships(id,name,application_deadline)").eq("university_id", id) : Promise.resolve({ data: [] }),
  ]);
  const progs = programs ?? [];
  const schols = ((links.data ?? []) as unknown as Linked).flatMap((l) => (l.scholarships ? [l.scholarships] : []));
  return (
    <>
      <BackLink href="/universities">Universities</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader icon={School} title={String(u.name)}>
          <p className="help-text">{[u.city, u.country].filter(Boolean).join(", ")}</p>
        </PageHeader>
        <div className="flex gap-2">
          <Link href={`/universities/${id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11 sm:h-9" })}><Pencil aria-hidden="true" />Edit</Link>
          <DeleteButton action={deleteUniversity.bind(null, id)} noun="university" name={String(u.name)} impact="This cannot be undone."
            blocked={progs.length ? `This university still has ${progs.length} master's program${progs.length > 1 ? "s" : ""}. Delete or move those programs first, so no program or application data is lost by accident.` : undefined} />
        </div>
      </div>
      <Card className="mt-6"><CardContent>
        {(u.is_preferred === true || s(u.university_type)) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {u.is_preferred === true && <Pill tone="warning"><Star className="mr-1 size-3 fill-current" aria-hidden="true" />Preferred</Pill>}
            {s(u.university_type) && <Pill tone="info">{u.university_type === "public" ? "Public" : "Private"}</Pill>}
          </div>
        )}
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Country">{s(u.country)}</Detail><Detail label="City">{s(u.city)}</Detail>
          <Detail label="Official website" wide><ExtLink href={u.website} /></Detail>
          <Detail label="Notes" wide>{s(u.notes)}</Detail>
        </dl>
      </CardContent></Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <h2 className="section-title">Master&apos;s programs <Pill tone="brand">{progs.length}</Pill></h2>
          <AddButton href={`/programs/new?university=${id}`}>Add program</AddButton>
        </CardHeader>
        <CardContent>
          {progs.length === 0 ? <EmptyState icon={GraduationCap} title="No programs yet">Add the master&apos;s programs you are considering at this university.</EmptyState> : (
            <ul className="divide-y">
              {progs.map((p) => (
                <li key={p.id}><Link href={`/programs/${p.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 hover:text-primary">
                  <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="help-text">{degreeLabel(p.degree_type)}{formatMoney(p.tuition_fee, p.currency) ? ` · ${formatMoney(p.tuition_fee, p.currency)}` : ""}</span></span>
                  <span className="text-sm"><Deadline date={p.application_deadline} today={today} /></span>
                </Link></li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {schols.length > 0 && (
        <Card className="mt-6"><CardHeader><h2 className="section-title">Linked scholarships</h2></CardHeader><CardContent>
          <ul className="divide-y">{schols.map((x) => (
            <li key={x.id}><Link href={`/scholarships/${x.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-primary"><span className="flex items-center gap-2 font-medium"><GraduationCap className="size-4 text-emerald" aria-hidden="true" />{x.name}</span><span className="text-sm"><Deadline date={x.application_deadline} today={today} /></span></Link></li>
          ))}</ul>
        </CardContent></Card>
      )}
    </>
  );
}
