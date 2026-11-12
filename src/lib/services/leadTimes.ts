import { and, asc, desc, eq } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { leadTimeProfiles, vendors } from "@/lib/db/schema";
import type { LeadTimeProfileRow } from "@/lib/db/schema";
import { PROCESSES } from "@/lib/options";
import { STEPS, STEP_LABELS } from "@/lib/timeline";
import type { DurationUnit, LeadTimeProfile, Origin, StepDurations } from "@/lib/timeline";
import { InputError } from "./errors";
import type { Member } from "./member";

export const MAX_LEAD_DAYS = 365;

export function toEngineProfile(row: LeadTimeProfileRow): LeadTimeProfile {
  return {
    id: row.id,
    name: row.name,
    scope: {
      vendorId: row.vendorId ?? undefined,
      origin: row.origin ?? undefined,
      process: row.process ?? undefined,
      displayType: row.displayType ?? undefined,
    },
    steps: row.steps,
  };
}

export async function listProfiles(db: Db, workspaceId: string): Promise<LeadTimeProfileRow[]> {
  return db
    .select()
    .from(leadTimeProfiles)
    .where(eq(leadTimeProfiles.workspaceId, workspaceId))
    .orderBy(desc(leadTimeProfiles.isDefault), asc(leadTimeProfiles.createdAt));
}

export type StepInput = Partial<Record<(typeof STEPS)[number], { days: string; unit: string }>>;

/** Turns form values into step durations. Blank days mean "not set by this profile". */
export function parseSteps(input: StepInput, requireAll: boolean): Partial<StepDurations> {
  const steps: Partial<StepDurations> = {};
  for (const step of STEPS) {
    const raw = input[step]?.days?.trim() ?? "";
    if (raw === "") {
      if (requireAll) throw new InputError(`The workspace default needs a number for ${STEP_LABELS[step]}.`);
      continue;
    }
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 0 || days > MAX_LEAD_DAYS) {
      throw new InputError(`${STEP_LABELS[step]} must be a whole number of days from 0 to ${MAX_LEAD_DAYS}.`);
    }
    const unit: DurationUnit = input[step]?.unit === "calendar" ? "calendar" : "working";
    steps[step] = { days, unit };
  }
  return steps;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new InputError("Give the profile a name of up to 80 characters.");
  return trimmed;
}

export async function updateProfile(db: Db, member: Member, id: string, input: { name: string; steps: StepInput }): Promise<void> {
  assertCan(member.membership.role, "leadTimes.edit");
  const [profile] = await db
    .select()
    .from(leadTimeProfiles)
    .where(and(eq(leadTimeProfiles.id, id), eq(leadTimeProfiles.workspaceId, member.workspace.id)));
  if (!profile) throw new InputError("That profile no longer exists.");
  const steps = parseSteps(input.steps, profile.isDefault);
  if (Object.keys(steps).length === 0) throw new InputError("Set at least one lead time, or delete the profile.");
  await db
    .update(leadTimeProfiles)
    .set({ name: profile.isDefault ? profile.name : cleanName(input.name), steps })
    .where(eq(leadTimeProfiles.id, profile.id));
}

export interface NewProfileInput {
  name: string;
  vendorId: string;
  origin: string;
  process: string;
  steps: StepInput;
}

export async function createProfile(db: Db, member: Member, input: NewProfileInput): Promise<void> {
  assertCan(member.membership.role, "leadTimes.edit");
  const name = cleanName(input.name);
  const origin: Origin | null = input.origin === "domestic" || input.origin === "overseas" ? input.origin : null;
  const process = PROCESSES.some((p) => p.id === input.process) ? input.process : null;
  let vendorId: string | null = null;
  if (input.vendorId) {
    const [vendor] = await db.select().from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, member.workspace.id)));
    if (!vendor) throw new InputError("Pick a vendor from your list.");
    vendorId = vendor.id;
  }
  if (!vendorId && !origin && !process) {
    throw new InputError("Choose what the profile applies to: a vendor, where it is made, or a process.");
  }
  const steps = parseSteps(input.steps, false);
  if (Object.keys(steps).length === 0) throw new InputError("Set at least one lead time.");
  await db.insert(leadTimeProfiles).values({ workspaceId: member.workspace.id, name, vendorId, origin, process, steps });
}

export async function deleteProfile(db: Db, member: Member, id: string): Promise<void> {
  assertCan(member.membership.role, "leadTimes.edit");
  await db
    .delete(leadTimeProfiles)
    .where(and(eq(leadTimeProfiles.id, id), eq(leadTimeProfiles.workspaceId, member.workspace.id), eq(leadTimeProfiles.isDefault, false)));
}
