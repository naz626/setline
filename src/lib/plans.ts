/**
 * Plans, prices and limits. Pure data and functions, no framework or database imports, like the timeline engine.
 * Vendor and retailer guests are free and unlimited on every plan, so no limit here ever counts them.
 */
export type PlanId = "trial" | "starter" | "team" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars. Undefined means the price is quoted. */
  monthly?: number;
  yearly?: number;
  /** Brand team seats, counting pending invitations. Undefined means no limit. */
  seats?: number;
  /** Programs not yet in store. Undefined means no limit. */
  openPrograms?: number;
  storageGb?: number;
  /** Slack or Teams alerts and the calendar feed. */
  alerts: boolean;
}

export const TRIAL_DAYS = 30;
export const TRIAL_EXTENSION_DAYS = 14;
export const FOUNDING_PLACES = 10;
export const FOUNDING_DISCOUNT = 0.5;
/** Days into the trial when a reminder goes out. */
export const TRIAL_REMINDER_DAYS = [20, 28] as const;

export const PLANS: Record<PlanId, Plan> = {
  // A trial has everything the Team plan has.
  trial: { id: "trial", name: "Free trial", seats: 15, storageGb: 50, alerts: true },
  starter: { id: "starter", name: "Starter", monthly: 149, yearly: 1490, seats: 5, openPrograms: 15, storageGb: 10, alerts: false },
  team: { id: "team", name: "Team", monthly: 349, yearly: 3490, seats: 15, storageGb: 50, alerts: true },
  enterprise: { id: "enterprise", name: "Enterprise", alerts: true },
};
export const PAID_PLANS: PlanId[] = ["starter", "team", "enterprise"];

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

export interface PlanState {
  plan: Plan;
  /** "trialing" and "active" can make changes. "expired" is read-only until a plan is chosen. */
  status: "trialing" | "active" | "expired";
  /** Whole days left in the trial, counting today. Only set while trialing. */
  trialDaysLeft?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Where a workspace stands right now. */
export function planState(workspace: { plan: PlanId; trialEndsAt: Date }, now: Date): PlanState {
  const plan = PLANS[workspace.plan] ?? PLANS.trial;
  if (plan.id !== "trial") return { plan, status: "active" };
  const left = workspace.trialEndsAt.getTime() - now.getTime();
  if (left <= 0) return { plan, status: "expired" };
  return { plan, status: "trialing", trialDaysLeft: Math.ceil(left / DAY) };
}

/** Which trial day a workspace is on (1 on the day it starts), given when its trial ends and how long it runs. */
export function trialDay(trialEndsAt: Date, now: Date, lengthDays: number): number {
  const start = trialEndsAt.getTime() - lengthDays * DAY;
  return Math.floor((now.getTime() - start) / DAY) + 1;
}

export function price(plan: Plan, founding: boolean): { monthly: number; yearly: number } | undefined {
  if (plan.monthly === undefined || plan.yearly === undefined) return undefined;
  const factor = founding ? 1 - FOUNDING_DISCOUNT : 1;
  return { monthly: Math.round(plan.monthly * factor * 100) / 100, yearly: Math.round(plan.yearly * factor * 100) / 100 };
}
