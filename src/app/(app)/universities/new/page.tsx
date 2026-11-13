import { School } from "lucide-react";
import { PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveUniversity } from "@/lib/records/actions";
import { hasExtras } from "@/lib/records/queries";
import { universityFields } from "@/lib/records/fields";

export const metadata = { title: "Add university · Scholarship Tracker" };

export default async function Page() {
  const { supabase } = await requireOwner();
  return (
    <>
      <BackLink href="/universities">Universities</BackLink>
      <PageHeader icon={School} title="Add university" />
      <Card className="mt-6"><CardContent><RecordForm fields={universityFields(await hasExtras(supabase))} action={saveUniversity.bind(null, null)} cancelHref="/universities" submitLabel="Save university" /></CardContent></Card>
    </>
  );
}
