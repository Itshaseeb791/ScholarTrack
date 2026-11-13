"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { mobileRoutes, moreRoutes, routes } from "@/lib/nav";

type Item = { label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }> };

// Rendered inside <Link>, so it knows when that exact link is navigating and can acknowledge the tap
// at once, before the destination has loaded.
function NavItem({ label, icon: Icon, active, mobile }: Item & { active: boolean; mobile: boolean }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  const icon = <Icon className={`size-5 shrink-0 ${pending ? "motion-safe:animate-pulse" : ""}`} aria-hidden="true" />;
  if (mobile) {
    return (
      <span data-pending={pending || undefined} className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] ${on ? "font-semibold text-primary" : "text-muted-foreground"}`}>
        <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${on ? "bg-accent" : "active:bg-muted"}`}>{icon}</span>
        <span className="max-w-full truncate">{label}</span>
      </span>
    );
  }
  return (
    <span data-pending={pending || undefined} className={`relative flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm transition-colors ${on
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white"}`}>
      {on && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-sidebar-primary" aria-hidden="true" />}
      {icon}<span className="truncate">{label}</span>
    </span>
  );
}

// usePathname() is runtime data on dynamic routes ([id]); the layout wraps AppNav in Suspense with StaticNav
// (same links, no active highlight) as the fallback so the shell still prerenders.
export function AppNav({ mobile = false }: { mobile?: boolean }) {
  return <NavView path={usePathname()} mobile={mobile} />;
}
export function StaticNav({ mobile = false }: { mobile?: boolean }) { return <NavView path="" mobile={mobile} />; }

function NavView({ path, mobile }: { path: string; mobile: boolean }) {
  const items = mobile ? mobileRoutes : routes;
  const match = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  // On mobile, "More" owns every route that is not in the bottom bar.
  const active = (href: string) => (href === "/more" ? match(href) || moreRoutes.some((r) => match(r.href)) : match(href));
  return (
    <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={mobile ? "mobile-navigation grid grid-cols-5 border-t bg-card/95 shadow-[0_-2px_12px_rgb(22_61_42/0.06)] backdrop-blur md:hidden" : "mt-8 flex flex-col gap-1"}>
      {items.map(({ href, label, icon }) => (
        <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
          className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60">
          <NavItem label={label} icon={icon} active={active(href)} mobile={mobile} />
        </Link>
      ))}
    </nav>
  );
}
