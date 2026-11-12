import { and, eq } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { programs, vendors } from "@/lib/db/schema";
import type { ProgramRow, VendorRow } from "@/lib/db/schema";
import { DISPLAY_TYPES } from "@/lib/options";
import {
  MILESTONES,
  MILESTONE_OWNER,
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
import { InputError } from "./errors";
import { listProfiles, toEngineProfile } from "./leadTimes";
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

/** Vendor guests only ever see their own vendor's programs. Everyone else sees the whole workspace. */
function visibleTo(member: Member) {
  const inWorkspace = eq(programs.workspaceId, member.workspace.id);
  if (member.membership.role !== "vendorGuest") return inWorkspace;
  // A vendor guest with no vendor attached sees nothing.
  return and(inWorkspace, eq(programs.vendorId, member.membership.vendorId ?? ""));
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
  const [created] = await db
    .insert(programs)
    .values({ workspaceId: member.workspace.id, name, retailer, displayType: input.displayType, storeCount, inStoreDate, vendorId, ownerId: member.user.id })
    .returning({ id: programs.id });
  return created.id;
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
  await db
    .update(programs)
    .set({ completed: { ...row.completed, [next]: today }, verified: next === "inStore" ? true : row.verified })
    .where(eq(programs.id, row.id));
}
