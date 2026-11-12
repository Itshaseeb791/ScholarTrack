"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="app-shell mx-auto max-w-lg px-5 py-16">
    <h1 className="text-2xl font-semibold">Your workspace is unavailable</h1>
    <p className="mt-4 text-muted-foreground">Check your connection and Supabase configuration, then try again.</p>
    <button className="mt-6 min-h-11 rounded-lg border px-5" onClick={reset}>Try again</button>
  </main>;
}
