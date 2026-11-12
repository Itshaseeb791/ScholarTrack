import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { IconTile, PageHeader } from "@/components/ui-kit";
import { moreRoutes } from "@/lib/nav";

export const metadata = { title: "More · Scholarship Tracker" };

export default function Page() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="mt-6 divide-y overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(22_61_42/0.05)]">
        {moreRoutes.map(({ href, label, icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-16 items-center gap-3 px-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent">
              <IconTile icon={icon} className="size-9" /><span className="flex-1 font-medium">{label}</span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
