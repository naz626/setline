import { describe, expect, it } from "vitest";
import { PLANS, planState, price, trialDay } from "./plans";

const at = (iso: string) => new Date(iso);

describe("plans", () => {
  it("counts trial days down and expires at the end", () => {
    const workspace = { plan: "trial" as const, trialEndsAt: at("2027-01-31T15:00:00Z") };
    expect(planState(workspace, at("2027-01-01T15:00:00Z"))).toMatchObject({ status: "trialing", trialDaysLeft: 30 });
    expect(planState(workspace, at("2027-01-31T14:00:00Z"))).toMatchObject({ status: "trialing", trialDaysLeft: 1 });
    expect(planState(workspace, at("2027-01-31T15:00:00Z")).status).toBe("expired");
  });

  it("never expires a paid plan, whatever the old trial date says", () => {
    expect(planState({ plan: "starter", trialEndsAt: at("2020-01-01T00:00:00Z") }, at("2027-01-01T00:00:00Z"))).toMatchObject({ status: "active", plan: PLANS.starter });
  });

  it("knows which trial day it is, including after an extension", () => {
    const ends = at("2027-01-31T15:00:00Z");
    expect(trialDay(ends, at("2027-01-01T16:00:00Z"), 30)).toBe(1);
    expect(trialDay(ends, at("2027-01-20T16:00:00Z"), 30)).toBe(20);
    expect(trialDay(ends, at("2027-01-28T16:00:00Z"), 30)).toBe(28);
  });

  it("halves the price for founding brands and has none for quoted plans", () => {
    expect(price(PLANS.starter, false)).toEqual({ monthly: 149, yearly: 1490 });
    expect(price(PLANS.team, true)).toEqual({ monthly: 174.5, yearly: 1745 });
    expect(price(PLANS.enterprise, false)).toBeUndefined();
  });
});
