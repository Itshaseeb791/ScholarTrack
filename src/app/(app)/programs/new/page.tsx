import { GraduationCap } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { Card, CardContent } from "@/components/ui/card";
import { RecordForm } from "@/components/records/record-form";
import { AddButton, BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveProgram } from "@/lib/records/actions";
import { universityOptions } from "@/lib/records/queries";
import { programFields } from "@/lib/records/fields";
import { first, type RawParams } from "@/lib/records/params";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Add program · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const unis = await universityOptions(supabase);
  const pre = first((await searchParams).university);
  const preselected = isUuid(pre) && unis.some((u) => u.id === pre) ? pre : "";
  return (
    <>
      <BackLink href={preselected ? `/universities/${preselected}` : "/programs"}>{preselected ? "University" : "Programs"}</BackLink>
      <PageHeader icon={GraduationCap} title="Add master's program" />
      <Card className="mt-6"><CardContent>
        {unis.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Add a university first">Every program belongs to a university.<AddButton href="/universities/new">Add university</AddButton></EmptyState>
        ) : (
          <RecordForm fields={programFields(unis)} action={saveProgram.bind(null, null)} initial={{ university_id: preselected }}
            cancelHref={preselected ? `/universities/${preselected}` : "/programs"} submitLabel="Save program" />
        )}
      </CardContent></Card>
    </>
  );
}
