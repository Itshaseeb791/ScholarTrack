import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { routes } from "@/lib/nav";

// Static on purpose: this renders no private data, so it is prefetched and shows instantly. The proxy still
// requires a verified owner session to reach it. Any page that loads Supabase data MUST call requireOwner().
export function Placeholder({ title, text }: { title: string; text: string }) {
  const icon = routes.find((r) => r.label === title)?.icon;
  return (
    <>
      <PageHeader icon={icon} title={title}><p className="help-text">{text}</p></PageHeader>
      <Card className="mt-6">
        <EmptyState icon={icon ?? Sparkles} title="Coming soon">
          Nothing to show yet. This section will be available in a later release.
        </EmptyState>
      </Card>
    </>
  );
}
