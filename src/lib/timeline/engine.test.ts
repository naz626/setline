import { describe, expect, it } from "vitest";
import { computeHealth, computeStage, projectForward, scheduleBackward } from "./engine";
import { resolveLeadTimes } from "./leadTimes";
import type { LeadTimeProfile, StepDurations } from "./types";

const w = (days: number) => ({ days, unit: "working" as const });
const c = (days: number) => ({ days, unit: "calendar" as const });

const DEFAULTS: StepDurations = {
  quote: w(5),
  structuralProof: w(10),
  printProof: w(10),
  production: w(20),
  shipPrep: w(2),
  transitAndSet: c(12),
};

describe("scheduleBackward", () => {
  it("counts every key date back from the in-store date", () => {
    expect(scheduleBackward("2027-04-19", DEFAULTS)).toEqual({
      submit: "2027-02-01",
      quoteApproved: "2027-02-08",
      structuralProofApproved: "2027-02-22",
      printProofApproved: "2027-03-08",
      productionComplete: "2027-04-05",
      shipped: "2027-04-07",
      inStore: "2027-04-19",
    });
  });

  it("moves a deadline that lands on a weekend to the Friday before", () => {
    const schedule = scheduleBackward("2027-04-19", { ...DEFAULTS, transitAndSet: c(9) });
    expect(schedule.shipped).toBe("2027-04-09"); // Apr 10 is a Saturday
  });

  it("can leave deadlines on weekends when asked", () => {
    const schedule = scheduleBackward("2027-04-19", { ...DEFAULTS, transitAndSet: c(9) }, { keepOnWorkingDays: false });
    expect(schedule.shipped).toBe("2027-04-10");
  });

  it("skips holidays", () => {
    const schedule = scheduleBackward("2027-04-19", DEFAULTS, { holidays: new Set(["2027-04-06"]) });
    expect(schedule.productionComplete).toBe("2027-04-02");
  });
});

describe("resolveLeadTimes", () => {
  const profiles: LeadTimeProfile[] = [
    { id: "default", name: "Workspace default", scope: {}, steps: DEFAULTS },
    { id: "overseas", name: "Overseas", scope: { origin: "overseas" }, steps: { production: w(30), transitAndSet: c(45) } },
    { id: "permanent", name: "Permanent fixtures", scope: { process: "permanent" }, steps: { production: w(35) } },
    { id: "kestrel", name: "Kestrel Fixtures", scope: { vendorId: "kestrel" }, steps: { quote: w(8) } },
  ];

  it("uses the workspace default when nothing narrower applies", () => {
    const resolved = resolveLeadTimes(profiles, { origin: "domestic", process: "corrugate" });
    expect(resolved.production).toMatchObject({ days: 20, source: { profileId: "default" } });
  });

  it("layers origin, process and vendor, narrowest last", () => {
    const resolved = resolveLeadTimes(profiles, { vendorId: "kestrel", origin: "overseas", process: "permanent" });
    expect(resolved.quote).toMatchObject({ days: 8, source: { profileId: "kestrel" } });
    expect(resolved.production).toMatchObject({ days: 35, source: { profileId: "permanent" } });
    expect(resolved.transitAndSet).toMatchObject({ days: 45, unit: "calendar", source: { profileId: "overseas" } });
    expect(resolved.printProof).toMatchObject({ days: 10, source: { profileId: "default" } });
  });

  it("lets a program override any step", () => {
    const resolved = resolveLeadTimes(profiles, { origin: "overseas" }, { production: w(12) });
    expect(resolved.production).toMatchObject({ days: 12, source: { kind: "program" } });
  });

  it("fails loudly when a step has no lead time anywhere", () => {
    expect(() => resolveLeadTimes([{ id: "x", name: "Partial", scope: {}, steps: { quote: w(5) } }], {})).toThrow(/No lead time/);
  });
});

describe("a reopened approval", () => {
  it("holds up the steps that remain, even when a later step was already done", () => {
    const planned = scheduleBackward("2027-04-19", DEFAULTS);
    // Print proof was approved and production finished, then a late change reopened the print proof.
    const completed = { submit: "2027-02-01", quoteApproved: "2027-02-08", structuralProofApproved: "2027-02-22", productionComplete: "2027-04-05" };
    const projected = projectForward({ planned, durations: DEFAULTS, completed, today: "2027-04-06" });
    expect(projected.printProofApproved).toBe("2027-04-06");
    expect(projected.productionComplete).toBe("2027-04-05");
    expect(projected.shipped).toBe("2027-04-08");
    expect(projected.inStore).toBe("2027-04-20");
    expect(computeHealth({ planned, projected, completed, today: "2027-04-06", hasVendor: true })).toBe("willMiss");
  });
});

describe("projectForward and computeHealth", () => {
  const planned = scheduleBackward("2027-04-19", DEFAULTS);
  const base = { planned, durations: DEFAULTS };

  it("keeps the plan when nothing is late", () => {
    const completed = { submit: "2027-01-29" };
    const projected = projectForward({ ...base, completed, today: "2027-02-02" });
    expect(projected.inStore).toBe("2027-04-19");
    expect(computeHealth({ planned, projected, completed, today: "2027-02-02", hasVendor: true })).toBe("onTrack");
  });

  it("flags a program when the next deadline is within three working days", () => {
    const completed = { submit: "2027-02-01" };
    const projected = projectForward({ ...base, completed, today: "2027-02-04" });
    expect(computeHealth({ planned, projected, completed, today: "2027-02-04", hasVendor: true })).toBe("atRisk");
  });

  it("pushes the in-store date when an approval is late", () => {
    const completed = { submit: "2027-02-01" };
    const projected = projectForward({ ...base, completed, today: "2027-02-11" }); // quote was due Feb 8
    expect(projected.quoteApproved).toBe("2027-02-11");
    expect(projected.inStore > planned.inStore).toBe(true);
    expect(computeHealth({ planned, projected, completed, today: "2027-02-11", hasVendor: true })).toBe("willMiss");
  });

  it("delays production when the vendor is backlogged past the planned start", () => {
    const completed = {
      submit: "2027-02-01",
      quoteApproved: "2027-02-08",
      structuralProofApproved: "2027-02-22",
      printProofApproved: "2027-03-08",
    };
    const projected = projectForward({ ...base, completed, today: "2027-03-09", backloggedUntil: "2027-03-15" });
    expect(projected.productionComplete).toBe("2027-04-12");
    expect(projected.inStore).toBe("2027-04-26");
  });

  it("absorbs a backlog that ends before production was planned to start", () => {
    const completed = { submit: "2027-01-04", quoteApproved: "2027-01-11", structuralProofApproved: "2027-01-25", printProofApproved: "2027-02-08" };
    const projected = projectForward({ ...base, completed, today: "2027-02-09", backloggedUntil: "2027-03-01" });
    expect(projected.inStore).toBe("2027-04-19");
  });

  it("reports not started without a vendor and complete once verified", () => {
    const projected = projectForward({ ...base, completed: {}, today: "2026-11-11" });
    expect(computeHealth({ planned, projected, completed: {}, today: "2026-11-11", hasVendor: false })).toBe("notStarted");
    expect(computeHealth({ planned, projected, completed: planned, today: "2027-04-20", hasVendor: true, verified: true })).toBe("complete");
  });

  it("derives the stage from what is done", () => {
    expect(computeStage({})).toBe("plan");
    expect(computeStage({ submit: "2027-02-01" })).toBe("submit");
    expect(computeStage({ submit: "2027-02-01", quoteApproved: "2027-02-08" })).toBe("approve");
    expect(computeStage({ submit: "a", quoteApproved: "b", structuralProofApproved: "c", printProofApproved: "d" })).toBe("produce");
  });
});
