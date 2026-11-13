import { notFound } from "next/navigation";
import { School } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveUniversity } from "@/lib/records/actions";
import { getRow, hasExtras } from "@/lib/records/queries";
import { universityFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Edit university · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const row = isUuid(id) ? await getRow(supabase, "universities", id) : null;
  if (!row) notFound();
  const initial = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? "" : v === true ? "on" : String(v)]));
  return (
    <>
      <BackLink href={`/universities/${id}`}>{String(row.name)}</BackLink>
      <PageHeader icon={School} title="Edit university" />
      <Card className="mt-6"><CardContent><RecordForm fields={universityFields(await hasExtras(supabase))} action={saveUniversity.bind(null, id)} initial={initial} cancelHref={`/universities/${id}`} submitLabel="Save changes" /></CardContent></Card>
    </>
  );
}
