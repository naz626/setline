import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/PublicShell";
import { getCurrentUser } from "@/lib/auth/session";
import { FOUNDING_DISCOUNT, FOUNDING_PLACES, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Setline: every display program, counted back from its in-store date",
  description: "Setline tracks retail display programs for brands: the in-store date, every approval and every vendor deadline, and what will make a date slip.",
};

/** People who are already signed in go straight to their programs. */
async function SignedInRedirect() {
  if (await getCurrentUser()) redirect("/programs");
  return null;
}

const POINTS = [
  { title: "Counted back from the in-store date", body: "Give Setline the date a display has to be on the floor. It works backward through artwork, proofs, production and shipping, using lead times you set per vendor." },
  { title: "Know what will slip, early", body: "Every program shows on track, at risk or will miss, with the step that is holding it up. Surprises show up on the timeline, not on the shelf." },
  { title: "Approvals in one place", body: "Proofs, changes requested and sign-offs are kept with the program, with a trail of who approved what and when." },
  { title: "Vendors and retailers join free", body: "Display vendors and retailer contacts get their own simple view at no charge. Only your brand team counts toward your plan." },
];

export default function Home() {
  return (
    <PublicShell>
      <Suspense fallback={null}><SignedInRedirect /></Suspense>
      <section className="flex flex-col gap-5 pt-6">
        <h1 className="max-w-[760px] font-display text-5xl font-bold leading-[1.05] tracking-tight">Know the date your display lands in store, and what will make it slip.</h1>
        <p className="max-w-[640px] text-lg leading-relaxed text-muted">Setline is the tracker for brands running floor stands, endcaps and shelf displays in retail. One timeline for every program, built from the in-store date back.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sign-in" className="inline-flex h-12 items-center rounded-xl bg-ink px-6 text-[15px] font-semibold text-white">Start your {TRIAL_DAYS}-day free trial</Link>
          <Link href="/pricing" className="inline-flex h-12 items-center rounded-xl border-[1.5px] border-ink px-6 text-[15px] font-semibold">See pricing</Link>
        </div>
        <p className="text-sm text-muted">No card needed to start. When the trial ends your workspace becomes read-only, and nothing is deleted for 60 days.</p>
      </section>

      <section aria-labelledby="why" className="flex flex-col gap-4">
        <h2 id="why" className="font-display text-3xl font-bold tracking-tight">Built for the people who chase the dates</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {POINTS.map((point) => (
            <div key={point.title} className="rounded-[18px] border border-line bg-surface px-6 py-5">
              <h3 className="font-display text-xl font-bold">{point.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="founding" className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-6 py-6">
        <h2 id="founding" className="font-display text-2xl font-bold">Founding brands</h2>
        <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">The first {FOUNDING_PLACES} brands get {FOUNDING_DISCOUNT * 100}% off their first year. If you are launching in stores soon, start a trial and tell us you want a founding place.</p>
        <Link href="/sign-in" className="inline-flex h-11 items-center self-start rounded-xl bg-ink px-5 text-sm font-semibold text-white">Start free trial</Link>
      </section>
    </PublicShell>
  );
}
