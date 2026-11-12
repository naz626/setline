"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">That did not work</h1>
      <p className="text-[15px] text-muted">
        {error.name === "ForbiddenError" ? "Your role does not allow that change." : "Something went wrong on our side. Nothing was changed."}
      </p>
      <button type="button" onClick={reset} className="h-12 self-start rounded-xl bg-ink px-5 text-sm font-semibold text-white">Try again</button>
    </main>
  );
}
