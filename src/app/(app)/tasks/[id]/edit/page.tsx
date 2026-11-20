import { notFound } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-kit";
import { RecordForm } from "@/components/records/record-form";
import { SetupNotice } from "@/components/records/application-parts";
import { BackLink } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { saveTask } from "@/lib/records/planning-actions";
import { applicationOptions, getTask, hasPhase7 } from "@/lib/records/planning-queries";
import { taskFields } from "@/lib/records/fields";
import { isUuid } from "@/lib/records/validate";

export const metadata = { title: "Edit task · Scholarship Tracker" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  if (!(await hasPhase7(supabase))) return <SetupNotice what="Tasks" file="20261115000100_phase7_planning.sql" />;
  const [task, apps] = await Promise.all([isUuid(id) ? getTask(supabase, id) : null, applicationOptions(supabase)]);
  if (!task) notFound();
  const initial: Record<string, string> = {
    title: task.title, description: task.description ?? "", status: task.status === "todo" ? "" : task.status, priority: task.priority === "medium" ? "" : task.priority,
    due_date: task.due_date ?? "", due_time: task.due_time?.slice(0, 5) ?? "", application_id: task.application_id ?? "",
  };
  return (
    <>
      <BackLink href={`/tasks/${id}`}>{task.title}</BackLink>
      <PageHeader icon={CheckSquare} title="Edit task" />
      <Card className="mt-6"><CardContent><RecordForm fields={taskFields(apps)} action={saveTask.bind(null, id)} initial={initial} cancelHref={`/tasks/${id}`} submitLabel="Save changes" /></CardContent></Card>
    </>
  );
}
