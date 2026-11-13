import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveProgram } from "@/lib/records/actions";
import { getRow, universityOptions } from "@/lib/records/queries";
import { programFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Edit program · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const [row, unis] = await Promise.all([isUuid(id) ? getRow(supabase, "programs", id) : null, universityOptions(supabase)]);
  if (!row) notFound();
  const initial = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? "" : String(v)]));
  return (
    <>
      <BackLink href={`/programs/${id}`}>{String(row.name)}</BackLink>
      <PageHeader icon={GraduationCap} title="Edit program" />
      <Card className="mt-6"><CardContent><RecordForm fields={programFields(unis)} action={saveProgram.bind(null, id)} initial={initial} cancelHref={`/programs/${id}`} submitLabel="Save changes" /></CardContent></Card>
    </>
  );
}
