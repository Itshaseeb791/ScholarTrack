import { Suspense } from "react";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getOwnerSession } from "@/lib/auth/session";
import { getOwnerId } from "@/lib/auth/owner";
import { LoginForm } from "./login-form";

async function LoginContent() {
  if (await getOwnerSession()) redirect("/");
  return <LoginForm configured={Boolean(getOwnerId())} />;
}

export default function LoginPage() {
  return (
    <main className="app-shell relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--accent),transparent_70%)] px-5 py-12">
      <section className="mx-5 min-w-0 w-full max-w-sm rounded-2xl border bg-card p-6 shadow-[0_10px_40px_-12px_rgb(22_101_52/0.25)] sm:p-8" aria-labelledby="login-title">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><GraduationCap className="size-8" aria-hidden="true" /></span>
        <p className="eyebrow mt-6 !text-primary">ScholarTrack</p>
        <h1 id="login-title" className="mt-1 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="help-text mt-2">Sign in to your personal scholarship workspace.</p>
        <Suspense fallback={<p role="status" className="help-text mt-8">Checking your session…</p>}><LoginContent /></Suspense>
      </section>
    </main>
  );
}
