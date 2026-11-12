import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { FOUNDING_DISCOUNT, PAID_PLANS, PLANS, TRIAL_EXTENSION_DAYS, price } from "@/lib/plans";
import { memberPlanState, workspaceUsage } from "@/lib/services/billing";
import { HEALTH_STYLES } from "@/lib/status";
import { formatStamp } from "@/lib/today";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const money = (amount: number) => `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function Billing() {
  const member = await requireBrandMember();
  const state = memberPlanState(member);
  const usage = await workspaceUsage(await getDb(), member.workspace.id);
  const { founding, trialEndsAt, timezone } = member.workspace;
  const pill = state.status === "active" ? { ...HEALTH_STYLES.onTrack, label: `${state.plan.name} plan` }
    : state.status === "trialing" ? { ...HEALTH_STYLES.complete, label: `Free trial, ${state.trialDaysLeft} ${state.trialDaysLeft === 1 ? "day" : "days"} left` }
    : { ...HEALTH_STYLES.willMiss, label: "Trial ended, read-only" };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-bold tracking-tight">Billing</h1>
        <StatusPill style={pill} />
      </div>

      <section className={`${CARD} flex flex-col gap-2`}>
        <h2 className="font-display text-xl font-bold">Where you stand</h2>
        {state.status === "trialing" && <p className="text-sm">Your free trial has every Team feature and runs until <strong className="font-semibold">{formatStamp(trialEndsAt, timezone)}</strong>. After that the workspace becomes read-only until you choose a plan. Nothing is deleted for 60 days, and one {TRIAL_EXTENSION_DAYS}-day extension is available if you are mid-program.</p>}
        {state.status === "expired" && <p className="text-sm">Your free trial ended {formatStamp(trialEndsAt, timezone)}. Everything is still here and readable, and vendors can still see their programs. Choosing a plan switches changes back on.</p>}
        {state.status === "active" && <p className="text-sm">You are on the {state.plan.name} plan.</p>}
        <p className="text-sm text-muted">
          In use: {usage.seats}{state.plan.seats ? ` of ${state.plan.seats}` : ""} brand team seats (including pending invites) · {usage.openPrograms}{state.plan.openPrograms ? ` of ${state.plan.openPrograms}` : ""} open programs. Vendor and retailer guests are free and not counted.
        </p>
        {founding && <p className="text-sm font-semibold" style={{ color: HEALTH_STYLES.onTrack.text }}>You are a founding brand: {FOUNDING_DISCOUNT * 100}% off your first year.</p>}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="plans">
        <h2 id="plans" className="font-display text-2xl font-bold tracking-tight">Plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PAID_PLANS.map((id) => {
            const plan = PLANS[id];
            const cost = price(plan, founding);
            const current = state.status === "active" && state.plan.id === id;
            return (
              <article key={id} className={`${CARD} flex flex-col gap-3 ${current ? "border-2 border-ink" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                  {current && <span className="text-[13px] font-semibold">Your plan</span>}
                </div>
                <p className="font-display text-3xl font-bold">
                  {cost ? <>{money(cost.monthly)}<span className="text-sm font-medium text-muted"> a month</span></> : "Quoted"}
                </p>
                {cost && <p className="-mt-2 text-[13px] text-muted">or {money(cost.yearly)} a year{founding ? ", founding price for the first year" : ", two months free"}</p>}
                <ul className="flex flex-col gap-1.5 text-sm">
                  <li>{plan.seats ? `Up to ${plan.seats} brand team seats` : "Unlimited brand team seats"}</li>
                  <li>{plan.openPrograms ? `Up to ${plan.openPrograms} open programs at once` : "Unlimited programs"}</li>
                  <li>Free, unlimited vendor and retailer guests</li>
                  <li>{plan.storageGb ? `${plan.storageGb} GB of file storage` : "Storage agreed per contract"}</li>
                  <li>Timeline, approvals, changes log, store rollout</li>
                  {plan.alerts ? <li>Slack or Teams alerts and calendar feed</li> : <li className="text-muted">No Slack or Teams alerts or calendar feed</li>}
                  {id === "enterprise" && <li>Esko and other connections, single sign-on (as they become available)</li>}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="text-sm text-muted">Paying by card in the app is not available yet. To choose a plan or ask for a trial extension, contact Setline{process.env.SUPPORT_EMAIL ? <> at <a href={`mailto:${process.env.SUPPORT_EMAIL}`} className="font-semibold text-ink underline">{process.env.SUPPORT_EMAIL}</a></> : null} and your plan will be switched on by hand.</p>
      </section>
    </>
  );
}

export default function BillingPage() {
  return (
    <AppShell active="/settings/billing">
      <Billing />
    </AppShell>
  );
}
