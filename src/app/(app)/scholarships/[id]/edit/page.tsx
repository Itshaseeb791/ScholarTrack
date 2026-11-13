import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveScholarship } from "@/lib/records/actions";
import { getRow, hasExtras } from "@/lib/records/queries";
import { scholarshipFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Edit scholarship · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const row = isUuid(id) ? await getRow(supabase, "scholarships", id) : null;
  if (!row) notFound();
  const initial = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? "" : String(v)]));
  return (
    <>
      <BackLink href={`/scholarships/${id}`}>{String(row.name)}</BackLink>
      <PageHeader icon={GraduationCap} title="Edit scholarship" />
      <Card className="mt-6"><CardContent><RecordForm fields={scholarshipFields(await hasExtras(supabase))} action={saveScholarship.bind(null, id)} initial={initial} cancelHref={`/scholarships/${id}`} submitLabel="Save changes" /></CardContent></Card>
    </>
  );
}
