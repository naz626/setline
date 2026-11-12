import { and, eq, sql } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { programFileKindEnum, programFiles, programs, vendors } from "@/lib/db/schema";
import type { ProgramFileKind, ProgramRow, VendorRow } from "@/lib/db/schema";
import { DISPLAY_TYPES } from "@/lib/options";
import {
  MILESTONES,
  MILESTONE_LABELS,
  MILESTONE_OWNER,
  formatShort,
  computeHealth,
  computeStage,
  effectiveVendorState,
  fromUTC,
  nextMilestone,
  projectForward,
  resolveLeadTimes,
  scheduleBackward,
  toUTC,
} from "@/lib/timeline";
import type { Health, ISODate, LeadTimeProfile, MilestoneKey, ResolvedLeadTimes, Schedule, Stage, VendorState } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import { listProfiles, parseSteps, toEngineProfile } from "./leadTimes";
import type { StepInput } from "./leadTimes";
import type { Member } from "./member";

export interface ProgramView {
  program: ProgramRow;
  vendor?: VendorRow;
  leadTimes: ResolvedLeadTimes;
  planned: Schedule;
  projected: Schedule;
  completed: Partial<Record<MilestoneKey, ISODate>>;
  next?: MilestoneKey;
  stage: Stage;
  health: Health;
  vendorState?: VendorState;
  approvalOverdue: boolean;
  today: ISODate;
}

/** Everything the screens need about one program, worked out from its dates, lead times and progress. */
export function buildProgramView(program: ProgramRow, vendor: VendorRow | undefined, profiles: readonly LeadTimeProfile[], today: ISODate): ProgramView {
  const leadTimes = resolveLeadTimes(
    profiles,
    { vendorId: vendor?.id, origin: vendor?.origin, process: vendor?.process, displayType: program.displayType },
    program.leadTimeOverrides,
  );
  const planned = scheduleBackward(program.inStoreDate, leadTimes);
  const completed = program.completed;
  const projected = projectForward({ planned, durations: leadTimes, completed, today, backloggedUntil: program.backloggedUntil ?? undefined });
  const next = nextMilestone(completed);
  const approvalOverdue = Boolean(vendor && next && next !== "submit" && MILESTONE_OWNER[next] === "brand" && planned[next] < today);
  return {
    program,
    vendor,
    leadTimes,
    planned,
    projected,
    completed,
    next,
    stage: computeStage(completed),
    health: computeHealth({ planned, projected, completed, today, hasVendor: Boolean(vendor), verified: program.verified, approvalOverdue }),
    vendorState: effectiveVendorState(program.vendorState ?? undefined, approvalOverdue),
    approvalOverdue,
    today,
  };
}

/** Vendor guests only ever see their own vendor's programs, and only once they are submitted. Everyone else sees the whole workspace. */
export function visibleTo(member: Member) {
  const inWorkspace = eq(programs.workspaceId, member.workspace.id);
  if (member.membership.role !== "vendorGuest") return inWorkspace;
  // A vendor guest with no vendor attached sees nothing.
  return and(inWorkspace, eq(programs.vendorId, member.membership.vendorId ?? ""), sql`${programs.completed} ->> 'submit' is not null`);
}

async function loadContext(db: Db, member: Member) {
  const [vendorRows, profileRows] = await Promise.all([
    db.select().from(vendors).where(eq(vendors.workspaceId, member.workspace.id)),
    listProfiles(db, member.workspace.id),
  ]);
  return {
    vendorById: new Map(vendorRows.map((v) => [v.id, v])),
    profiles: profileRows.map(toEngineProfile),
    today: todayInZone(member.workspace.timezone),
  };
}

const HEALTH_ORDER: Health[] = ["willMiss", "atRisk", "onTrack", "notStarted", "complete"];

/** The programs this person may see, most urgent first. */
export async function listProgramViews(db: Db, member: Member): Promise<ProgramView[]> {
  const [rows, context] = await Promise.all([db.select().from(programs).where(visibleTo(member)), loadContext(db, member)]);
  return rows
    .map((row) => buildProgramView(row, row.vendorId ? context.vendorById.get(row.vendorId) : undefined, context.profiles, context.today))
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.program.inStoreDate.localeCompare(b.program.inStoreDate));
}

export async function getProgramView(db: Db, member: Member, id: string): Promise<ProgramView | undefined> {
  const [[row], context] = await Promise.all([db.select().from(programs).where(and(visibleTo(member), eq(programs.id, id))), loadContext(db, member)]);
  if (!row) return undefined;
  return buildProgramView(row, row.vendorId ? context.vendorById.get(row.vendorId) : undefined, context.profiles, context.today);
}

/** The program row if this person may see it. Use before any change that hangs off a program. */
export async function findVisibleProgram(db: Db, member: Member, id: string): Promise<ProgramRow> {
  const [row] = await db.select().from(programs).where(and(visibleTo(member), eq(programs.id, id)));
  if (!row) throw new InputError("That program no longer exists.");
  return row;
}

/** Links are the only kind of file for now. Only https links are kept so a link can never run script. */
export function parseLink(value: string, label = "The link"): string {
  const trimmed = value.trim();
  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {}
  if (!url || url.protocol !== "https:" || trimmed.length > 2000) throw new InputError(`${label} must be a full https:// address.`);
  return url.toString();
}

export function parseDate(value: string, label: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || fromUTC(toUTC(value)) !== value) {
    throw new InputError(`${label} needs a real date.`);
  }
  return value;
}

export interface NewProgramInput {
  name: string;
  retailer: string;
  displayType: string;
  storeCount: string;
  inStoreDate: string;
  vendorId: string;
  /** Lead times changed for this one program. Blank steps keep the profile's number. */
  leadTimes?: StepInput;
  /** Links to the files the vendor needs. Blank links are skipped. */
  files?: { kind: string; url: string }[];
  /** Marks "Submit to vendor" done today, which starts the clock. Needs a vendor. */
  submitNow?: boolean;
}

export async function createProgram(db: Db, member: Member, input: NewProgramInput): Promise<string> {
  assertCan(member.membership.role, "programs.create");
  const name = input.name.trim();
  if (!name || name.length > 120) throw new InputError("Give the program a name of up to 120 characters.");
  const retailer = input.retailer.trim().slice(0, 120);
  if (!(DISPLAY_TYPES as readonly string[]).includes(input.displayType)) throw new InputError("Choose a display type.");
  const inStoreDate = parseDate(input.inStoreDate, "The in-store date");
  let storeCount: number | null = null;
  if (input.storeCount.trim() !== "") {
    storeCount = Number(input.storeCount);
    if (!Number.isInteger(storeCount) || storeCount < 0 || storeCount > 100_000) throw new InputError("Store count must be a whole number.");
  }
  let vendorId: string | null = null;
  if (input.vendorId) {
    const [vendor] = await db.select().from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, member.workspace.id)));
    if (!vendor) throw new InputError("Pick a vendor from your list, or leave it for later.");
    vendorId = vendor.id;
  }
  const leadTimeOverrides = parseSteps(input.leadTimes ?? {}, false);
  const files = (input.files ?? []).filter((file) => file.url.trim() !== "").map((file) => {
    if (!(programFileKindEnum.enumValues as readonly string[]).includes(file.kind)) throw new InputError("Choose what kind of file this is.");
    return { kind: file.kind as ProgramFileKind, url: parseLink(file.url, "Each file link") };
  });
  if (input.submitNow && !vendorId) throw new InputError("Choose a vendor before submitting, or save the program as a plan.");
  const today = todayInZone(member.workspace.timezone);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(programs)
      .values({
        workspaceId: member.workspace.id, name, retailer, displayType: input.displayType, storeCount, inStoreDate, vendorId, ownerId: member.user.id,
        leadTimeOverrides, completed: input.submitNow ? { submit: today } : {},
      })
      .returning({ id: programs.id });
    if (files.length > 0) {
      await tx.insert(programFiles).values(files.map((file) => ({ ...file, workspaceId: member.workspace.id, programId: created.id, addedBy: member.user.id })));
    }
    await recordActivity(tx, member, created.id, "created", `Created the program${input.submitNow ? " and submitted it to the vendor" : ""}, in store ${formatShort(inStoreDate)}`);
    return created.id;
  });
}

/**
 * Marks the next key date as done today. Only the next one can be completed, so dates always finish in order.
 * Completing "In store" also marks the program verified until the in-store tracker takes that over.
 */
export async function completeNextMilestone(db: Db, member: Member, programId: string, key: string): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const [row] = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.workspaceId, member.workspace.id)));
  if (!row) throw new InputError("That program no longer exists.");
  const next = nextMilestone(row.completed);
  if (!next || next !== key || !(MILESTONES as readonly string[]).includes(key)) {
    throw new InputError("That date is not the next one to complete. Refresh the page and try again.");
  }
  if (next !== "submit" && !row.vendorId) throw new InputError("Choose a vendor before completing this date.");
  const today = todayInZone(member.workspace.timezone);
  await db.transaction(async (tx) => {
    await tx
      .update(programs)
      .set({ completed: { ...row.completed, [next]: today }, verified: next === "inStore" ? true : row.verified })
      .where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "milestone", `Completed: ${MILESTONE_LABELS[next]}`);
  });
}

/** Chooses or changes the vendor. Dates are recalculated from that vendor's lead times the next time the program is read. */
export async function assignVendor(db: Db, member: Member, programId: string, vendorId: string): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  const [vendor] = await db.select().from(vendors).where(and(eq(vendors.id, vendorId), eq(vendors.workspaceId, member.workspace.id)));
  if (!vendor) throw new InputError("Pick a vendor from your list.");
  if (row.completed.productionComplete) throw new InputError("Production is already complete, so the vendor can no longer change.");
  if (row.vendorId === vendor.id) return;
  // The old vendor's status does not carry over to the new one.
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ vendorId: vendor.id, vendorState: null, backloggedUntil: null }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "vendorAssigned", `${row.vendorId ? "Changed the vendor to" : "Chose the vendor"} ${vendor.name}`);
  });
}

/** Moves the target in-store date. Every key date is counted back from the new date the next time the program is read. */
export async function moveInStoreDate(db: Db, member: Member, programId: string, date: string): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  if (row.completed.inStore) throw new InputError("This program is already in store.");
  const inStoreDate = parseDate(date, "The in-store date");
  if (inStoreDate < todayInZone(member.workspace.timezone)) throw new InputError("The in-store date cannot be in the past.");
  if (inStoreDate === row.inStoreDate) return;
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ inStoreDate }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "dateMoved", `Moved the in-store date from ${formatShort(row.inStoreDate)} to ${formatShort(inStoreDate)}`);
  });
}
