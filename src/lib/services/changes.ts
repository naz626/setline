import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { changeCategoryEnum, programChanges, programs, proofs, users } from "@/lib/db/schema";
import type { ChangeCategory, ProofKind } from "@/lib/db/schema";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import type { Member } from "./member";
import { findVisibleProgram, visibleTo } from "./programs";
import { PROOF_KINDS, PROOF_LABELS } from "./proofs";

export const CHANGE_CATEGORIES = changeCategoryEnum.enumValues;
export const CHANGE_LABELS: Record<ChangeCategory, string> = {
  artwork: "Artwork",
  structure: "Structure",
  quantities: "Quantities",
  stores: "Store list",
  dates: "Dates",
  other: "Other",
};

export interface NewChangeInput {
  programId: string;
  category: string;
  summary: string;
  /** Approvals that have to be redone because of this change. */
  reopen: string[];
}

/**
 * Records a change to a submitted program and reopens the approvals it affects. Changes can be logged at any
 * point until the program is in store; approvals can be reopened until it ships. Reopening an approval takes
 * its key date back and withdraws the approved version, so the timeline shows the real effect straight away.
 */
export async function logChange(db: Db, member: Member, input: NewChangeInput): Promise<string> {
  assertCan(member.membership.role, "changes.log");
  const program = await findVisibleProgram(db, member, input.programId);
  if (!program.completed.submit) throw new InputError("This program has not been submitted yet, so you can simply edit it.");
  if (program.completed.inStore) throw new InputError("This program is already in store.");
  if (!(CHANGE_CATEGORIES as readonly string[]).includes(input.category)) throw new InputError("Choose what kind of change this is.");
  const summary = input.summary.trim();
  if (!summary || summary.length > 1000) throw new InputError("Describe the change in up to 1,000 characters.");
  const reopen = [...new Set(input.reopen)];
  if (reopen.some((kind) => !(PROOF_KINDS as readonly string[]).includes(kind))) throw new InputError("Choose which approvals to reopen.");
  if (reopen.length > 0 && program.completed.shipped) throw new InputError("This program has shipped, so approvals can no longer be reopened.");
  const kinds = reopen as ProofKind[];

  return db.transaction(async (tx) => {
    // Only approvals that were actually given are reopened; one still in progress already takes a new version.
    const reopened: ProofKind[] = [];
    const completed = { ...program.completed };
    for (const kind of kinds) {
      const approvedRows = await tx.update(proofs).set({ reopenedAt: new Date() })
        .where(and(eq(proofs.programId, program.id), eq(proofs.kind, kind), eq(proofs.decision, "approved"), isNull(proofs.reopenedAt)))
        .returning({ id: proofs.id });
      if (completed[kind] || approvedRows.length > 0) reopened.push(kind);
      delete completed[kind];
    }
    if (reopened.length > 0) await tx.update(programs).set({ completed }).where(eq(programs.id, program.id));
    const [row] = await tx.insert(programChanges)
      .values({ workspaceId: member.workspace.id, programId: program.id, category: input.category as ChangeCategory, summary, reopened, createdBy: member.user.id })
      .returning({ id: programChanges.id });
    const reopenedText = reopened.length > 0 ? ` Reopened: ${reopened.map((kind) => PROOF_LABELS[kind].toLowerCase()).join(", ")}.` : "";
    await recordActivity(tx, member, program.id, "change", `Change (${CHANGE_LABELS[input.category as ChangeCategory].toLowerCase()}): ${summary}${/[.!?]$/.test(summary) ? "" : "."}${reopenedText}`);
    return row.id;
  });
}

/** Changes on a program, newest first. The vendor's contacts see them for their own programs. */
export async function listChanges(db: Db, member: Member, programId: string) {
  const program = await findVisibleProgram(db, member, programId);
  const author = alias(users, "author");
  const seenBy = alias(users, "seen_by");
  return db
    .select({
      id: programChanges.id, category: programChanges.category, summary: programChanges.summary, reopened: programChanges.reopened,
      createdAt: programChanges.createdAt, acknowledgedAt: programChanges.acknowledgedAt, by: author.email, acknowledgedBy: seenBy.email,
    })
    .from(programChanges)
    .leftJoin(author, eq(author.id, programChanges.createdBy))
    .leftJoin(seenBy, eq(seenBy.id, programChanges.acknowledgedBy))
    .where(eq(programChanges.programId, program.id))
    .orderBy(desc(programChanges.createdAt), desc(programChanges.id));
}

/** Confirms the vendor has seen a change. The vendor's contact does this, or the brand after hearing from them. */
export async function acknowledgeChange(db: Db, member: Member, changeId: string): Promise<void> {
  assertCan(member.membership.role, "changes.acknowledge");
  const [change] = await db.select().from(programChanges).where(and(eq(programChanges.id, changeId), eq(programChanges.workspaceId, member.workspace.id)));
  if (!change) throw new InputError("That change no longer exists.");
  // Throws for a vendor guest whose vendor is not on the program.
  await findVisibleProgram(db, member, change.programId);
  if (change.acknowledgedAt) return;
  await db.transaction(async (tx) => {
    await tx.update(programChanges).set({ acknowledgedBy: member.user.id, acknowledgedAt: new Date() }).where(eq(programChanges.id, change.id));
    await recordActivity(tx, member, change.programId, "change",
      member.membership.role === "vendorGuest" ? "The vendor confirmed they saw a change" : "Marked a change as seen by the vendor");
  });
}

/** How many changes the vendor has not confirmed yet, per program this person can see. */
export async function countUnseenChanges(db: Db, member: Member): Promise<Map<string, number>> {
  const visible = await db.select({ id: programs.id }).from(programs).where(visibleTo(member));
  if (visible.length === 0) return new Map();
  const rows = await db
    .select({ programId: programChanges.programId, count: sql<number>`count(*)::int` })
    .from(programChanges)
    .where(and(inArray(programChanges.programId, visible.map((p) => p.id)), isNull(programChanges.acknowledgedAt)))
    .groupBy(programChanges.programId);
  return new Map(rows.map((r) => [r.programId, r.count]));
}
