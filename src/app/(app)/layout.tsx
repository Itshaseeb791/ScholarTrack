import { GraduationCap } from "lucide-react";
import { Suspense } from "react";
import { AppNav, StaticNav } from "@/components/app-nav";
import { BellLink, ReminderBell } from "@/components/reminder-bell";
import { SessionGuard } from "@/components/session-guard";
import { SignOutButton } from "@/components/sign-out-button";

// Static chrome: it paints immediately and holds no private data. Each page verifies the owner itself
// with requireOwner() and streams behind loading.tsx, so navigation never waits on the database.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh bg-background">
      <SessionGuard />
      <a href="#main" className="sr-only z-50 rounded bg-card p-4 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-sidebar p-5 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-1">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><GraduationCap className="size-6" aria-hidden="true" /></span>
          <div className="leading-tight"><p className="font-semibold tracking-tight text-white">ScholarTrack</p><p className="text-xs text-sidebar-foreground/80">Scholarship planner</p></div>
        </div>
        <Suspense fallback={<StaticNav />}><AppNav /></Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b bg-card/90 px-5 py-2 backdrop-blur sm:px-8 md:px-10">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground md:hidden"><GraduationCap className="size-5" aria-hidden="true" /></span>
            <p className="font-semibold tracking-tight md:hidden">ScholarTrack</p>
            <div className="ml-auto flex items-center gap-2"><Suspense fallback={<BellLink />}><ReminderBell /></Suspense><SignOutButton /></div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-5 py-6 sm:px-8 md:px-10 md:py-10">{children}</main>
      </div>
      <Suspense fallback={<StaticNav mobile />}><AppNav mobile /></Suspense>
    </div>
  );
}
