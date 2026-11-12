"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

// Hidden by default. The toggle is type="button" so it never submits, and it only flips the input
// type on the same element, so the typed value is kept.
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={"min-h-11 pr-12 " + (className ?? "")} />
      <button type="button" onClick={() => setVisible((v) => !v)} disabled={props.disabled}
        aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
