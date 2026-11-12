import type { ISODate } from "./dates";

/** Where the display is made. Overseas work usually adds ocean or air transit. */
export type Origin = "domestic" | "overseas";

/** How the display is made. Kept as an open string so workspaces can add their own. */
export type Process = string;

export const MILESTONES = [
  "submit",
  "quoteApproved",
  "structuralProofApproved",
  "printProofApproved",
  "productionComplete",
  "shipped",
  "inStore",
] as const;
export type MilestoneKey = (typeof MILESTONES)[number];

/** A step is the time allowed between two neighbouring milestones. */
export const STEPS = ["quote", "structuralProof", "printProof", "production", "shipPrep", "transitAndSet"] as const;
export type StepKey = (typeof STEPS)[number];

/** Each step ends at this milestone. STEPS[i] runs from MILESTONES[i] to MILESTONES[i + 1]. */
export const STEP_LABELS: Record<StepKey, string> = {
  quote: "Quote",
  structuralProof: "Structural proof",
  printProof: "Print proof",
  production: "Production",
  shipPrep: "Pack and ship",
  transitAndSet: "Transit and store set",
};

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  submit: "Submit to vendor",
  quoteApproved: "Vendor quote approved",
  structuralProofApproved: "Structural proof approved",
  printProofApproved: "Print proof approved",
  productionComplete: "Production complete",
  shipped: "Ships to stores",
  inStore: "In store",
};

export const MILESTONE_OWNER: Record<MilestoneKey, "brand" | "vendor" | "target"> = {
  submit: "brand",
  quoteApproved: "brand",
  structuralProofApproved: "brand",
  printProofApproved: "brand",
  productionComplete: "vendor",
  shipped: "vendor",
  inStore: "target",
};

export type DurationUnit = "working" | "calendar";
export interface Duration {
  days: number;
  unit: DurationUnit;
}
export type StepDurations = Record<StepKey, Duration>;

/**
 * A lead-time profile supplies durations for some or all steps, for the programs it applies to.
 * A profile with an empty scope is the workspace default. Narrower scopes win over broader ones.
 */
export interface LeadTimeProfile {
  id: string;
  name: string;
  scope: {
    vendorId?: string;
    origin?: Origin;
    process?: Process;
    displayType?: string;
  };
  steps: Partial<StepDurations>;
}

export interface LeadTimeContext {
  vendorId?: string;
  origin?: Origin;
  process?: Process;
  displayType?: string;
}

export interface ResolvedStep extends Duration {
  /** Where this number came from, for showing "why" in the UI. */
  source: { kind: "profile"; profileId: string; profileName: string } | { kind: "program" };
}
export type ResolvedLeadTimes = Record<StepKey, ResolvedStep>;

export interface ScheduleOptions {
  /** Keep every deadline on a working day. Defaults to true. */
  keepOnWorkingDays?: boolean;
  holidays?: ReadonlySet<ISODate>;
}

export type Schedule = Record<MilestoneKey, ISODate>;

export type Health = "notStarted" | "onTrack" | "atRisk" | "willMiss" | "complete";
export type VendorState = "working" | "waitingOnYou" | "backlogged";
export type Stage = "plan" | "submit" | "approve" | "produce" | "ship" | "inStore";
