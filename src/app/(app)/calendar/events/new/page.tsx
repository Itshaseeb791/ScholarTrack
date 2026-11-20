import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-kit";
import { RecordForm } from "@/components/records/record-form";
import { SetupNotice } from "@/components/records/application-parts";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveEvent } from "@/lib/records/planning-actions";
import { applicationOptions, hasPhase7 } from "@/lib/records/planning-queries";
import { eventFields } from "@/lib/records/fields";
import { first, type RawParams } from "@/lib/records/params";
import { isUuid } from "@/lib/records/validate";
import { isDateOnly } from "@/lib/time";

export const metadata = { title: "Add event · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const raw = await searchParams;
  if (!(await hasPhase7(supabase))) return <SetupNotice what="Events" file="20261115000100_phase7_planning.sql" />;
  const apps = await applicationOptions(supabase);
  const app = first(raw.application), date = first(raw.date);
  const initial = { application_id: isUuid(app) && apps.some((a) => a[0] === app) ? app : "", start_date: isDateOnly(date) ? date : "" };
  const back = initial.application_id ? `/applications/${initial.application_id}` : isDateOnly(date) ? `/calendar?view=month&date=${date}` : "/calendar";
  return (
    <>
      <BackLink href={back}>{initial.application_id ? "Application" : "Calendar"}</BackLink>
      <PageHeader icon={CalendarDays} title="Add event" />
      <Card className="mt-6"><CardContent><RecordForm fields={eventFields(apps)} action={saveEvent.bind(null, null)} initial={initial} cancelHref={back} submitLabel="Save event" /></CardContent></Card>
    </>
  );
}
