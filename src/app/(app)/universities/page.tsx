import Link from "next/link";
import { MapPin, School, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconTile, PageHeader, Pill } from "@/components/ui-kit";
import { FilterBar } from "@/components/records/filter-bar";
import { AddButton, Empty, Pager } from "@/components/records/parts";
import { requireOwner } from "@/lib/auth/session";
import { distinct, FILTERS, hasExtras, listUniversities, SORTS } from "@/lib/records/queries";
import { hasActiveFilters, parseListParams, type RawParams } from "@/lib/records/params";

export const metadata = { title: "Universities · Scholarship Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { supabase } = await requireOwner();
  const p = parseListParams(await searchParams, SORTS.universities, FILTERS.universities);
  const extras = await hasExtras(supabase);
  const [{ rows, total }, countries] = await Promise.all([listUniversities(supabase, p, extras), distinct(supabase, "universities", "country")]);
  const current: Record<string, string> = { ...(p.q && { q: p.q }), ...p.filters, ...(p.sort !== SORTS.universities[0] && { sort: p.sort }) };
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader icon={School} title="Universities"><p className="help-text">{total} saved</p></PageHeader>
        <AddButton href="/universities/new">Add university</AddButton>
      </div>
      <div className="mt-6">
        <FilterBar current={current} placeholder="Search name, country or city"
          filters={[{ name: "country", label: "Country", options: countries.map((c) => [c, c] as const) },
            ...(extras ? [{ name: "preferred", label: "Preferred", options: [["1", "Preferred only"]] as const }] : [])]}
          sorts={[["name", "Name A–Z"], ["recent", "Recently added"]]} />
      </div>
      <div className="mt-5">
        {rows.length === 0 ? <Empty filtered={hasActiveFilters(p)} icon={School} noun="universities" addHref="/universities/new" addLabel="Add university" /> : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((u) => {
                const n = u.programs?.[0]?.count ?? 0;
                return (
                  <li key={u.id}>
                    <Link href={`/universities/${u.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent">
                      <IconTile icon={School} className="size-10" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-medium"><span className="truncate">{String(u.name)}</span>{u.is_preferred === true && <Star className="size-4 shrink-0 fill-warning text-warning" aria-label="Preferred" />}</p>
                        <p className="help-text flex items-center gap-1 truncate"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{[u.city, u.country].filter(Boolean).join(", ")}</p>
                      </div>
                      <Pill tone="brand">{n} program{n === 1 ? "" : "s"}</Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {total > 0 && <Pager base="/universities" current={current} page={p.page} total={total} />}
      </div>
    </>
  );
}
