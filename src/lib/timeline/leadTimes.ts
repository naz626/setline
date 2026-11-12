import { STEPS } from "./types";
import type { Duration, LeadTimeContext, LeadTimeProfile, ResolvedLeadTimes, StepDurations, StepKey } from "./types";

/** Vendor-specific numbers beat process, which beats origin, which beats display type. */
const WEIGHTS = { vendorId: 8, process: 4, origin: 2, displayType: 1 } as const;
type ScopeKey = keyof typeof WEIGHTS;
const SCOPE_KEYS = Object.keys(WEIGHTS) as ScopeKey[];

export function profileMatches(profile: LeadTimeProfile, context: LeadTimeContext): boolean {
  return SCOPE_KEYS.every((key) => profile.scope[key] === undefined || profile.scope[key] === context[key]);
}

export function specificity(profile: LeadTimeProfile): number {
  return SCOPE_KEYS.reduce((sum, key) => sum + (profile.scope[key] !== undefined ? WEIGHTS[key] : 0), 0);
}

/**
 * Works out the lead times for one program.
 * Layers every matching profile from broadest to narrowest, then applies the program's own overrides.
 * Throws if any step ends up without a duration, which means the workspace default is incomplete.
 */
export function resolveLeadTimes(
  profiles: readonly LeadTimeProfile[],
  context: LeadTimeContext,
  programOverrides: Partial<StepDurations> = {},
): ResolvedLeadTimes {
  const matching = profiles
    .filter((p) => profileMatches(p, context))
    .sort((a, b) => specificity(a) - specificity(b));

  const resolved: Partial<ResolvedLeadTimes> = {};
  for (const profile of matching) {
    for (const step of STEPS) {
      const duration = profile.steps[step];
      if (duration) {
        resolved[step] = { ...duration, source: { kind: "profile", profileId: profile.id, profileName: profile.name } };
      }
    }
  }
  for (const step of STEPS) {
    const duration = programOverrides[step];
    if (duration) resolved[step] = { ...duration, source: { kind: "program" } };
  }

  const missing = STEPS.filter((step) => !resolved[step]);
  if (missing.length > 0) {
    throw new Error(`No lead time set for: ${missing.join(", ")}. Add them to the workspace default profile.`);
  }
  return resolved as ResolvedLeadTimes;
}

export function validateDuration(duration: Duration, step: StepKey): void {
  if (!Number.isInteger(duration.days) || duration.days < 0) {
    throw new Error(`Lead time for ${step} must be a whole number of days, zero or more.`);
  }
}
