import { Files, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { RecordForm } from "@/components/records/record-form";
import { SetupNotice } from "@/components/records/application-parts";
import { AddButton, BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveApplication } from "@/lib/records/application-actions";
import { hasPhase6, programGroups } from "@/lib/records/application-queries";
import { applicationFields } from "@/lib/records/fields";
import { first, type RawParams } from "@/lib/records/params";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Add application · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const pre = first((await searchParams).program);
  const ready = await hasPhase6(supabase);
  const groups = ready ? await programGroups(supabase) : [];
  const preselected = isUuid(pre) && groups.some((g) => g.options.some((o) => o[0] === pre)) ? pre : "";
  const back = preselected ? `/programs/${preselected}` : "/applications";
  return (
    <>
      <BackLink href={back}>{preselected ? "Program" : "Applications"}</BackLink>
      <PageHeader icon={Files} title="Add application" />
      {!ready ? <SetupNotice /> : (
        <Card className="mt-6"><CardContent>
          {groups.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Add a program first">An application is for a master&apos;s program, and you have none yet.<AddButton href="/programs/new">Add program</AddButton></EmptyState>
          ) : (
            <RecordForm fields={applicationFields(groups, true)} action={saveApplication.bind(null, null)} initial={{ program_id: preselected }} cancelHref={back} submitLabel="Save application" />
          )}
        </CardContent></Card>
      )}
    </>
  );
}
