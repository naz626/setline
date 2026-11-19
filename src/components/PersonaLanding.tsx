import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { FOUNDING_DISCOUNT, FOUNDING_PLACES, TRIAL_DAYS } from "@/lib/plans";

export interface PersonaPoint {
  title: string;
  body: string;
}

export interface PersonaContent {
  /** Shown above the headline, e.g. "For trade and shopper marketing managers" */
  kicker: string;
  headline: string;
  subhead: string;
  ctaLabel?: string;
  points: PersonaPoint[];
}

/**
 * Shared layout for the audience-specific landing pages used in LinkedIn ad campaigns
 * (/for/trade-marketing, /for/retail-ops, /for/supply-chain). Same structure as the
 * homepage, different headline and points per persona, same sign-up CTA so the
 * LinkedIn "Sign Up" conversion still fires normally.
 */
export function PersonaLanding({ kicker, headline, subhead, ctaLabel, points }: PersonaContent) {
  return (
    <PublicShell>
      <section className="flex flex-col gap-5 pt-6">
        <p className="text-sm font-semibold tracking-wide text-accent-text uppercase">{kicker}</p>
        <h1 className="max-w-[760px] font-display text-5xl font-bold leading-[1.05] tracking-tight">{headline}</h1>
        <p className="max-w-[640px] text-lg leading-relaxed text-muted">{subhead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sign-in" className="inline-flex h-12 items-center rounded-xl bg-ink px-6 text-[15px] font-semibold text-white">{ctaLabel ?? `Start your ${TRIAL_DAYS}-day free trial`}</Link>
          <Link href="/pricing" className="inline-flex h-12 items-center rounded-xl border-[1.5px] border-ink px-6 text-[15px] font-semibold">See pricing</Link>
        </div>
        <p className="text-sm text-muted">No card needed to start. When the trial ends your workspace becomes read-only, and nothing is deleted for 60 days.</p>
      </section>

      <section aria-labelledby="why" className="flex flex-col gap-4">
        <h2 id="why" className="font-display text-3xl font-bold tracking-tight">Built for the people who chase the dates</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {points.map((point) => (
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
