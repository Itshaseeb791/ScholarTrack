"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(login, { error: null });
  const off = pending || !configured;
  const described = state.error ? "login-error" : undefined;
  return (
    <form action={action} className="mt-8 space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        {/* Remounted with the echoed email so a failed attempt keeps what was typed. */}
        <Input key={state.email ?? ""} id="email" name="email" type="email" inputMode="email" autoComplete="username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required maxLength={254}
          className="min-h-11" disabled={off} defaultValue={state.email}
          aria-invalid={state.field === "email" || undefined} aria-describedby={described} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={1024} disabled={off}
          aria-invalid={state.field === "password" || undefined} aria-describedby={described} />
      </div>
      <p id="login-error" role="alert" className="min-h-5 text-sm font-medium text-danger">{state.error}</p>
      {!configured && <p className="text-sm text-muted-foreground">Owner access has not been configured. Complete the setup in the README before signing in.</p>}
      <Button type="submit" className="min-h-12 w-full text-base font-semibold active:translate-y-px" disabled={off}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
