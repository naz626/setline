import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { assertBrand, assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { invitations, memberships, originEnum, programs, users, vendorStateEnum, vendorStatusEvents, vendors } from "@/lib/db/schema";
import { PROCESSES } from "@/lib/options";
import { MILESTONE_LABELS, formatShort, nextMilestone } from "@/lib/timeline";
import type { MilestoneKey } from "@/lib/timeline";
import type { Origin, VendorState } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import type { Member } from "./member";
import { findVisibleProgram, parseDate } from "./programs";

/** Vendors with the people who can sign in for each. Brand team only. */
export async function listVendors(db: Db, member: Member) {
  assertBrand(member.membership.role);
  const inWorkspace = eq(vendors.workspaceId, member.workspace.id);
  const [vendorRows, contacts, invited] = await Promise.all([
    db.select().from(vendors).where(inWorkspace).orderBy(asc(vendors.name)),
    db.select({ vendorId: memberships.vendorId, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, member.workspace.id), eq(memberships.role, "vendorGuest"))),
    db.select({ vendorId: invitations.vendorId, email: invitations.email }).from(invitations)
      .where(and(eq(invitations.workspaceId, member.workspace.id), eq(invitations.role, "vendorGuest"), isNull(invitations.acceptedAt))),
  ]);
  return vendorRows.map((vendor) => ({
    vendor,
    contacts: contacts.filter((c) => c.vendorId === vendor.id).map((c) => c.email),
    invited: invited.filter((c) => c.vendorId === vendor.id).map((c) => c.email),
  }));
}

export interface NewVendorInput {
  name: string;
  makes: string;
  origin: string;
  process: string;
}

export async function createVendor(db: Db, member: Member, input: NewVendorInput): Promise<string> {
  assertCan(member.membership.role, "vendors.manage");
  const name = input.name.trim();
  if (!name || name.length > 120) throw new InputError("Give the vendor a name of up to 120 characters.");
  if (!(originEnum.enumValues as readonly string[]).includes(input.origin)) throw new InputError("Choose where this vendor makes displays.");
  if (!PROCESSES.some((p) => p.id === input.process)) throw new InputError("Choose a process.");
  const [existing] = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.workspaceId, member.workspace.id), eq(vendors.name, name)));
  if (existing) throw new InputError("You already have a vendor with that name.");
  const [row] = await db
    .insert(vendors)
    .values({ workspaceId: member.workspace.id, name, makes: input.makes.trim().slice(0, 200), origin: input.origin as Origin, process: input.process })
    .returning({ id: vendors.id });
  return row.id;
}

export const STATE_WORDS: Record<VendorState, string> = { working: "Working", waitingOnYou: "Waiting on the brand", backlogged: "Backlogged" };

export interface VendorStatusInput {
  programId: string;
  state: string;
  note: string;
  expectedStart: string;
}

/**
 * Records what the vendor says is happening. Vendor guests can only reach their own vendor's programs.
 * Backlogged needs the date work can start, which the timeline uses to project the in-store date.
 */
export async function setVendorStatus(db: Db, member: Member, input: VendorStatusInput): Promise<void> {
  assertCan(member.membership.role, "vendorStatus.set");
  const program = await findVisibleProgram(db, member, input.programId);
  if (!program.vendorId) throw new InputError("This program has no vendor yet.");
  if (program.completed.inStore) throw new InputError("This program is already in store.");
  if (!(vendorStateEnum.enumValues as readonly string[]).includes(input.state)) throw new InputError("Choose a status.");
  const state = input.state as VendorState;
  const note = input.note.trim().slice(0, 500);
  let expectedStart: string | null = null;
  if (state === "backlogged") {
    if (!input.expectedStart) throw new InputError("Add the date you expect to start, so the brand can see the effect on the in-store date.");
    expectedStart = parseDate(input.expectedStart, "The expected start date");
    if (expectedStart < todayInZone(member.workspace.timezone)) throw new InputError("The expected start date cannot be in the past.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(vendorStatusEvents).values({ workspaceId: member.workspace.id, programId: program.id, state, note, expectedStart, setBy: member.user.id });
    await tx.update(programs).set({ vendorState: state, backloggedUntil: expectedStart }).where(eq(programs.id, program.id));
    await recordActivity(tx, member, program.id, "vendorStatus", `Vendor status: ${STATE_WORDS[state]}${expectedStart ? `, can start ${formatShort(expectedStart)}` : ""}${note ? `. “${note}”` : ""}`);
  });
}

export async function listStatusHistory(db: Db, member: Member, programId: string) {
  const program = await findVisibleProgram(db, member, programId);
  return db
    .select({ id: vendorStatusEvents.id, state: vendorStatusEvents.state, note: vendorStatusEvents.note, expectedStart: vendorStatusEvents.expectedStart, createdAt: vendorStatusEvents.createdAt, by: users.email })
    .from(vendorStatusEvents)
    .leftJoin(users, eq(users.id, vendorStatusEvents.setBy))
    .where(eq(vendorStatusEvents.programId, program.id))
    .orderBy(desc(vendorStatusEvents.createdAt))
    .limit(20);
}

const VENDOR_MILESTONES = ["productionComplete", "shipped"] as const;

/** Lets the vendor (or the brand) mark production complete or shipped, in order, dated today. */
export async function completeVendorMilestone(db: Db, member: Member, programId: string, key: string): Promise<void> {
  assertCan(member.membership.role, "vendorMilestones.complete");
  const program = await findVisibleProgram(db, member, programId);
  const next = nextMilestone(program.completed);
  if (!(VENDOR_MILESTONES as readonly string[]).includes(key) || next !== key) {
    throw new InputError("That step is not the next one. Refresh the page and try again.");
  }
  await db.transaction(async (tx) => {
    await tx.update(programs).set({ completed: { ...program.completed, [key]: todayInZone(member.workspace.timezone) } }).where(eq(programs.id, program.id));
    await recordActivity(tx, member, program.id, "milestone", `Completed: ${MILESTONE_LABELS[key as MilestoneKey]}`);
  });
}
