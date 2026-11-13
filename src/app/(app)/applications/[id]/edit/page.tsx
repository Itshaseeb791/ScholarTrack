import { notFound } from "next/navigation";
import { Files } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-kit";
import { RecordForm } from "@/components/records/record-form";
import { SetupNotice } from "@/components/records/application-parts";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveApplication } from "@/lib/records/application-actions";
import { hasPhase6, programGroups } from "@/lib/records/application-queries";
import { applicationFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Edit application · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase6(supabase))) return <SetupNotice />;
  const [{ data: row }, groups] = await Promise.all([
    isUuid(id) ? supabase.from("application_overview").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    programGroups(supabase),
  ]);
  if (!row) notFound();
  const initial = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? "" : String(v)]));
  return (
    <>
      <BackLink href={`/applications/${id}`}>{row.university_name}</BackLink>
      <PageHeader icon={Files} title="Edit application"><p className="help-text">Changing the status here is recorded in the history too.</p></PageHeader>
      <Card className="mt-6"><CardContent>
        <RecordForm fields={applicationFields(groups, false)} action={saveApplication.bind(null, id)} initial={initial} cancelHref={`/applications/${id}`} submitLabel="Save changes" />
      </CardContent></Card>
    </>
  );
}
