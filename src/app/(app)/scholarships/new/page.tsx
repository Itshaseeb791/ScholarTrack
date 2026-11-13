import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveScholarship } from "@/lib/records/actions";
import { hasExtras } from "@/lib/records/queries";
import { scholarshipFields } from "@/lib/records/fields";

export const metadata = { title: "Add scholarship · Scholarship Tracker" };

export default async function Page() {
  const { supabase } = await requireOwner();
  return (
    <>
      <BackLink href="/scholarships">Scholarships</BackLink>
      <PageHeader icon={GraduationCap} title="Add scholarship" />
      <Card className="mt-6"><CardContent><RecordForm fields={scholarshipFields(await hasExtras(supabase))} action={saveScholarship.bind(null, null)} cancelHref="/scholarships" submitLabel="Save scholarship" /></CardContent></Card>
    </>
  );
}
