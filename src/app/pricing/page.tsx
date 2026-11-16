import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { FOUNDING_DISCOUNT, FOUNDING_PLACES, PAID_PLANS, PLANS, TRIAL_DAYS } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Pricing | Setline",
  description: "Setline plans for brands. Vendor and retailer guests are always free.",
};

const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;

function features(plan: Plan): string[] {
  return [
    plan.seats ? `Up to ${plan.seats} brand team seats` : "Unlimited brand team seats",
    plan.openPrograms ? `Up to ${plan.openPrograms} open programs at once` : "Unlimited programs",
    "Free, unlimited vendor and retailer guests",
    plan.storageGb ? `${plan.storageGb} GB of file storage` : "File storage agreed per contract",
    "Timeline, approvals, changes log, store rollout",
    plan.alerts ? "Slack or Teams alerts and a calendar feed" : "No Slack or Teams alerts or calendar feed",
  ];
}

export default function Pricing() {
  const support = supportEmail();
  return (
    <PublicShell>
      <section className="flex flex-col gap-3 pt-4">
        <h1 className="font-display text-5xl font-bold tracking-tight">Simple pricing</h1>
        <p className="max-w-[640px] text-lg leading-relaxed text-muted">Every plan starts with a {TRIAL_DAYS}-day free trial that includes every Team feature. You only pay for your brand team. Vendor and retailer guests are free.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {PAID_PLANS.map((id) => {
          const plan = PLANS[id];
          return (
            <section key={id} aria-labelledby={`plan-${id}`} className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-6 py-6">
              <h2 id={`plan-${id}`} className="font-display text-2xl font-bold">{plan.name}</h2>
              {plan.monthly !== undefined && plan.yearly !== undefined ? (
                <p><span className="font-display text-4xl font-bold">{money(plan.monthly)}</span> <span className="text-sm text-muted">a month</span><br /><span className="text-sm text-muted">or {money(plan.yearly)} a year, two months free</span></p>
              ) : (
                <p className="font-display text-4xl font-bold">Quoted</p>
              )}
              <ul className="flex flex-col gap-1.5 text-[15px]">
                {features(plan).map((line) => <li key={line} className="ml-5 list-disc">{line}</li>)}
              </ul>
              {plan.monthly !== undefined
                ? <Link href="/sign-in" className="mt-auto inline-flex h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-white">Start free trial</Link>
                : support
                  ? <a href={`mailto:${support}`} className="mt-auto inline-flex h-11 items-center justify-center rounded-xl border-[1.5px] border-ink px-5 text-sm font-semibold">Contact us</a>
                  : <p className="mt-auto text-sm text-muted">Enterprise is quoted per contract.</p>}
            </section>
          );
        })}
      </div>
      <section className="flex flex-col gap-2 text-[15px] leading-relaxed text-muted">
        <p><strong className="font-semibold text-ink">Founding brands.</strong> The first {FOUNDING_PLACES} brands get {FOUNDING_DISCOUNT * 100}% off their first year.</p>
        <p><strong className="font-semibold text-ink">Taxes.</strong> Prices are in US dollars and exclude sales tax. Tax is worked out at checkout from your billing address.</p>
        <p><strong className="font-semibold text-ink">If you stop.</strong> You can cancel from the billing page at any time. A workspace without a plan becomes read-only, and nothing is deleted for 60 days.</p>
      </section>
    </PublicShell>
  );
}
