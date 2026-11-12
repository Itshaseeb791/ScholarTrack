import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeletons mirror the real markup (same grid, card padding and row heights) to avoid layout shift.
// `data-loading` marks a loading state for tests; the sr-only text announces it.
function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="status" aria-busy="true" data-loading><span className="sr-only">{label}</span>{children}</div>;
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="size-11 rounded-xl sm:size-12" />
      <div className="space-y-2"><Skeleton className="h-8 w-44" /><Skeleton className="h-4 w-36" /></div>
    </div>
  );
}

function Row() {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <Skeleton className="size-11 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

function CardSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader><div className="flex items-center gap-2.5"><Skeleton className="size-5" /><Skeleton className="h-6 w-40" /></div></CardHeader>
      <CardContent className="divide-y">{Array.from({ length: rows }, (_, i) => <Row key={i} />)}</CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <Loading label="Loading dashboard">
      <Header />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3.5 sm:p-4">
            <Skeleton className="size-10 rounded-xl sm:size-11" />
            <div className="space-y-2"><Skeleton className="h-3.5 w-16" /><Skeleton className="h-7 w-10" /></div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
        <CardSkeleton rows={4} />
        <CardSkeleton rows={3} />
        <CardSkeleton rows={3} className="lg:col-span-2" />
      </div>
    </Loading>
  );
}

export function PageSkeleton() {
  return (
    <Loading label="Loading page">
      <Header />
      <Card className="mt-6"><CardContent className="flex flex-col items-center gap-3 py-10"><Skeleton className="size-12 rounded-full" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></CardContent></Card>
    </Loading>
  );
}
