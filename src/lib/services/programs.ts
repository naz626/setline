import { and, eq, sql } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { programFileKindEnum, programFiles, programs, vendors } from "@/lib/db/schema";
import type { ProgramFileKind, ProgramRow, VendorRow, WorkspaceRow } from "@/lib/db/schema";
import { DISPLAY_TYPES } from "@/lib/options";
import {
  MILESTONES,
  MILESTONE_LABELS,
  MILESTONE_OWNER,
  STEPS,
  STEP_LABELS,
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
import type { Health, ISODate, LeadTimeProfile, MilestoneKey, ResolvedLeadTimes, Schedule, Stage, StepDurations, VendorState } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { recordActivity } from "./activity";
import { assertProgramRoom } from "./billing";
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

/**
 * Vendor guests only ever see their own vendor's programs, and retailer guests only their own retailer's
 * programs, in both cases only once submitted. Everyone else sees the whole workspace.
 */
export function visibleTo(member: Member) {
  const inWorkspace = eq(programs.workspaceId, member.workspace.id);
  const role = member.membership.role;
  if (role === "vendorGuest") {
    // A vendor guest with no vendor attached sees nothing.
    return and(inWorkspace, eq(programs.vendorId, member.membership.vendorId ?? ""), sql`${programs.completed} ->> 'submit' is not null`);
  }
  if (role === "retailerGuest") {
    // A retailer guest with no retailer attached sees nothing. The match ignores case so "Target" and "target" are the same retailer.
    const retailer = member.membership.retailer ?? "";
    return and(inWorkspace, retailer ? sql`lower(${programs.retailer}) = lower(${retailer})` : sql`false`, sql`${programs.completed} ->> 'submit' is not null`);
  }
  return inWorkspace;
}

async function loadContext(db: Db, { workspace }: { workspace: WorkspaceRow }) {
  const [vendorRows, profileRows] = await Promise.all([
    db.select().from(vendors).where(eq(vendors.workspaceId, workspace.id)),
    listProfiles(db, workspace.id),
  ]);
  return {
    vendorById: new Map(vendorRows.map((v) => [v.id, v])),
    profiles: profileRows.map(toEngineProfile),
    today: todayInZone(workspace.timezone),
  };
}

/**
 * Every open program in a workspace, for the calendar feed. There is no signed-in person here:
 * the caller must already have matched the feed's secret to this workspace.
 */
export async function listOpenProgramsForFeed(db: Db, workspace: WorkspaceRow): Promise<ProgramView[]> {
  const [rows, context] = await Promise.all([db.select().from(programs).where(eq(programs.workspaceId, workspace.id)), loadContext(db, { workspace })]);
  return rows
    .map((row) => buildProgramView(row, row.vendorId ? context.vendorById.get(row.vendorId) : undefined, context.profiles, context.today))
    .filter((view) => view.health !== "complete");
}

export interface ImportResult {
  created: number;
}

/**
 * Creates plans from pasted spreadsheet rows: name, retailer, display type, in-store date, vendor (optional),
 * store count (optional). Columns are separated by tabs or commas. Nothing is saved unless every row is valid.
 */
export async function importPrograms(db: Db, member: Member, pasted: string): Promise<ImportResult> {
  assertCan(member.membership.role, "programs.create");
  const lines = pasted.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // A first row that is clearly a header is skipped.
  if (lines.length > 0 && /^"?(program|name)\b/i.test(lines[0])) lines.shift();
  if (lines.length === 0) throw new InputError("Paste at least one row: name, retailer, display type, in-store date.");
  if (lines.length > 200) throw new InputError("Import up to 200 programs at a time.");
  const vendorRows = await db.select().from(vendors).where(eq(vendors.workspaceId, member.workspace.id));
  await db.transaction(async (tx) => {
    for (const [index, line] of lines.entries()) {
      const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((cell) => cell.trim().replace(/^"|"$/g, ""));
      const [name = "", retailer = "", displayType = "", inStoreDate = "", vendorName = "", storeCount = ""] = cells;
      const row = `Row ${index + 1}${name ? ` (${name})` : ""}`;
      const type = DISPLAY_TYPES.find((t) => t.toLowerCase() === displayType.toLowerCase());
      if (!type) throw new InputError(`${row}: the display type must be one of ${DISPLAY_TYPES.join(", ")}.`);
      const vendor = vendorName ? vendorRows.find((v) => v.name.toLowerCase() === vendorName.toLowerCase()) : undefined;
      if (vendorName && !vendor) throw new InputError(`${row}: there is no vendor called “${vendorName}”. Add the vendor first or leave the column empty.`);
      try {
        // The transaction stands in for the database, so one bad row rolls every row back.
        await createProgram(tx as unknown as Db, member, { name, retailer, displayType: type, storeCount, inStoreDate, vendorId: vendor?.id ?? "" });
      } catch (error) {
        if (error instanceof InputError) throw new InputError(`${row}: ${error.message}${/date/.test(error.message) ? " Use the form 2027-03-15." : ""}`);
        throw error;
      }
    }
  });
  return { created: lines.length };
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
/** How an uploaded file is recorded in a link column: this prefix, then its path in file storage. */
export const UPLOAD_PREFIX = "blob:";

/** Where a workspace's uploads live in file storage. Nothing outside it can be attached to that workspace's records. */
export function uploadFolder(workspaceId: string): string {
  return `w/${workspaceId}/`;
}

/**
 * Checks a file reference: a full https link, or an upload made by this workspace.
 * Pass the workspace to accept uploads; without it only links are allowed.
 */
export function parseLink(value: string, label = "The link", workspaceId?: string): string {
  const trimmed = value.trim();
  if (workspaceId && trimmed.startsWith(UPLOAD_PREFIX)) {
    const path = trimmed.slice(UPLOAD_PREFIX.length);
    if (!path.startsWith(uploadFolder(workspaceId)) || path.includes("..") || path.length > 600) throw new InputError("That upload could not be found. Upload the file again.");
    return trimmed;
  }
  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {}
  if (!url || url.protocol !== "https:" || trimmed.length > 2000) throw new InputError(`${label} must be an uploaded file or a full https:// address.`);
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

export interface ProgramDetailsInput {
  name: string;
  retailer: string;
  displayType: string;
  storeCount: string;
}

function parseDetails(input: ProgramDetailsInput) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new InputError("Give the program a name of up to 120 characters.");
  const retailer = input.retailer.trim().slice(0, 120);
  if (!(DISPLAY_TYPES as readonly string[]).includes(input.displayType)) throw new InputError("Choose a display type.");
  let storeCount: number | null = null;
  if (input.storeCount.trim() !== "") {
    storeCount = Number(input.storeCount);
    if (!Number.isInteger(storeCount) || storeCount < 0 || storeCount > 100_000) throw new InputError("Store count must be a whole number.");
  }
  return { name, retailer, displayType: input.displayType, storeCount };
}

export async function createProgram(db: Db, member: Member, input: NewProgramInput): Promise<string> {
  assertCan(member.membership.role, "programs.create");
  const { name, retailer, displayType, storeCount } = parseDetails(input);
  const inStoreDate = parseDate(input.inStoreDate, "The in-store date");
  let vendorId: string | null = null;
  if (input.vendorId) {
    const [vendor] = await db.select().from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, member.workspace.id)));
    if (!vendor) throw new InputError("Pick a vendor from your list, or leave it for later.");
    vendorId = vendor.id;
  }
  const leadTimeOverrides = parseSteps(input.leadTimes ?? {}, false);
  const files = (input.files ?? []).filter((file) => file.url.trim() !== "").map((file) => {
    if (!(programFileKindEnum.enumValues as readonly string[]).includes(file.kind)) throw new InputError("Choose what kind of file this is.");
    return { kind: file.kind as ProgramFileKind, url: parseLink(file.url, "Each file link", member.workspace.id) };
  });
  if (input.submitNow && !vendorId) throw new InputError("Choose a vendor before submitting, or save the program as a plan.");
  await assertProgramRoom(db, member);
  const today = todayInZone(member.workspace.timezone);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(programs)
      .values({
        workspaceId: member.workspace.id, name, retailer, displayType, storeCount, inStoreDate, vendorId, ownerId: member.user.id,
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

/** Changes a program's name, retailer, display type or store count at any point, and logs what changed. */
export async function updateProgramDetails(db: Db, member: Member, programId: string, input: ProgramDetailsInput): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  const next = parseDetails(input);
  const labels = { name: "name", retailer: "retailer", displayType: "display type", storeCount: "store count" } as const;
  const changes = (Object.keys(labels) as (keyof typeof labels)[])
    .filter((key) => next[key] !== row[key])
    .map((key) => `${labels[key]} from “${row[key] ?? "none"}” to “${next[key] ?? "none"}”`);
  if (changes.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.update(programs).set(next).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "details", `Changed the ${changes.join(", the ")}`);
  });
}

/**
 * Sets the lead times for this one program. A step that matches what the profiles already give is not stored,
 * so the program keeps following the profiles for it.
 */
export async function updateProgramLeadTimes(db: Db, member: Member, programId: string, input: StepInput): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  const wanted = parseSteps(input, false);
  const context = await loadContext(db, member);
  const vendor = row.vendorId ? context.vendorById.get(row.vendorId) : undefined;
  const scope = { vendorId: vendor?.id, origin: vendor?.origin, process: vendor?.process, displayType: row.displayType };
  const fromProfiles = resolveLeadTimes(context.profiles, scope);
  const before = resolveLeadTimes(context.profiles, scope, row.leadTimeOverrides);
  const overrides: Partial<StepDurations> = {};
  const changes: string[] = [];
  for (const step of STEPS) {
    const want = wanted[step];
    if (want && (want.days !== fromProfiles[step].days || want.unit !== fromProfiles[step].unit)) overrides[step] = want;
    const after = overrides[step] ?? fromProfiles[step];
    if (after.days !== before[step].days || after.unit !== before[step].unit) {
      changes.push(`${STEP_LABELS[step]} from ${before[step].days} to ${after.days} ${after.unit} days`);
    }
  }
  if (changes.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ leadTimeOverrides: overrides }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "leadTimes", `Changed this program's lead times: ${changes.join(", ")}`);
  });
}

/**
 * Takes back the most recently completed key date, for a mistake or a step that has to be redone.
 * Only the last one can be undone, so dates stay in order; undo again to go further back.
 */
export async function undoMilestone(db: Db, member: Member, programId: string, key: string): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  const last = [...MILESTONES].reverse().find((m) => row.completed[m]);
  if (!last || last !== key) throw new InputError("Only the most recently completed date can be undone. Refresh the page and try again.");
  const completed = { ...row.completed };
  delete completed[last];
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ completed, verified: last === "inStore" ? false : row.verified }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "milestone", `Marked as not done: ${MILESTONE_LABELS[last]} (was done ${formatShort(row.completed[last]!)})`);
  });
}

/** Corrects the day a key date was completed. It cannot be in the future. */
export async function setMilestoneDate(db: Db, member: Member, programId: string, key: string, date: string): Promise<void> {
  assertCan(member.membership.role, "programs.editSchedule");
  const row = await findVisibleProgram(db, member, programId);
  const milestone = MILESTONES.find((m) => m === key);
  const was = milestone && row.completed[milestone];
  if (!milestone || !was) throw new InputError("That date is not marked as done.");
  const doneOn = parseDate(date, "The completion date");
  if (doneOn > todayInZone(member.workspace.timezone)) throw new InputError("A completed date cannot be in the future.");
  if (doneOn === was) return;
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ completed: { ...row.completed, [milestone]: doneOn } }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "milestone", `Corrected ${MILESTONE_LABELS[milestone]}: done ${formatShort(doneOn)}, not ${formatShort(was)}`);
  });
}

/** Records the retailer's sign-off on a program. A retailer guest gives it; the brand can record it for them. */
export async function giveRetailerSignoff(db: Db, member: Member, programId: string, note: string): Promise<void> {
  assertCan(member.membership.role, "retailer.signoff");
  const row = await findVisibleProgram(db, member, programId);
  if (row.retailerApprovedAt) return;
  const retailerNote = note.trim().slice(0, 500);
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ retailerApprovedAt: new Date(), retailerApprovedBy: member.user.id, retailerNote }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "retailer",
      `${member.membership.role === "retailerGuest" ? "The retailer signed off" : "Recorded the retailer's sign-off"}${retailerNote ? `. “${retailerNote}”` : ""}`);
  });
}

/** Takes the retailer's sign-off back, for example after a change the retailer has to see again. */
export async function withdrawRetailerSignoff(db: Db, member: Member, programId: string): Promise<void> {
  assertCan(member.membership.role, "retailer.signoff");
  const row = await findVisibleProgram(db, member, programId);
  if (!row.retailerApprovedAt) return;
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ retailerApprovedAt: null, retailerApprovedBy: null, retailerNote: "" }).where(eq(programs.id, row.id));
    await recordActivity(tx, member, row.id, "retailer", "Withdrew the retailer's sign-off");
  });
}
