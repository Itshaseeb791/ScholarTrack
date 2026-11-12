import type { ComponentType } from "react";

// Small server-rendered building blocks shared by every page, so new pages inherit the look.
type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

export const toneClass: Record<Tone, string> = {
  brand: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};

export function IconTile({ icon: Icon, tone = "brand", className = "" }: { icon: Icon; tone?: Tone; className?: string }) {
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass[tone]} ${className}`}><Icon className="size-5" aria-hidden="true" /></span>;
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}

export function PageHeader({ icon, title, children }: { icon?: Icon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon && <IconTile icon={icon} className="size-11 sm:size-12" />}
      <div className="min-w-0"><h1 className="page-title">{title}</h1>{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: Icon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"><Icon className="size-6" aria-hidden="true" /></span>
      <p className="mt-4 font-medium">{title}</p>
      {children && <p className="help-text mt-1 max-w-sm">{children}</p>}
    </div>
  );
}
