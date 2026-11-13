import { and, eq } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { sampleApprovals } from "@/lib/db/schema";
import type { SampleApprovalRow } from "@/lib/db/schema";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import type { Member } from "./member";
import { findVisibleProgram, parseLink } from "./programs";
import { forgetUpload } from "./storage";

/**
 * A lighter-weight approval than a proof: one photo of a physical sample per program, with a single
 * approve or changes-requested decision. No version history — a resubmission replaces the one row,
 * and the earlier decision (if any) is cleared so it needs a fresh look.
 */
/** Where the sample-photo approval stands, from the one row kept per program. */
export function sampleStatus(row: SampleApprovalRow | undefined): "notSent" | "needsDecision" | "changesRequested" | "approved" {
  if (!row) return "notSent";
  if (!row.decision) return "needsDecision";
  return row.decision;
}

export async function getSampleApproval(db: Db, member: Member, programId: string): Promise<SampleApprovalRow | undefined> {
  assertCan(member.membership.role, "samples.view");
  const program = await findVisibleProgram(db, member, programId);
  const [row] = await db.select().from(sampleApprovals).where(and(eq(sampleApprovals.programId, program.id), eq(sampleApprovals.workspaceId, member.workspace.id)));
  return row;
}

/** The photo's URL, for the file route, but only if this person may see the program it belongs to. */
export async function findSampleUrl(db: Db, member: Member, sampleId: string): Promise<string | undefined> {
  const [row] = await db.select().from(sampleApprovals).where(and(eq(sampleApprovals.id, sampleId), eq(sampleApprovals.workspaceId, member.workspace.id)));
  if (!row) return undefined;
  try {
    await findVisibleProgram(db, member, row.programId);
  } catch (error) {
    if (error instanceof InputError) return undefined;
    throw error;
  }
  return row.url;
}

export async function submitSamplePhoto(db: Db, member: Member, input: { programId: string; url: string; note: string }): Promise<void> {
  assertCan(member.membership.role, "samples.submit");
  const program = await findVisibleProgram(db, member, input.programId);
  if (program.completed.shipped) throw new InputError("This program has shipped, so sample photos can no longer change.");
  const url = parseLink(input.url, "The photo link", member.workspace.id);
  const note = input.note.trim().slice(0, 1000);
  const [existing] = await db.select().from(sampleApprovals).where(eq(sampleApprovals.programId, program.id));
  const hadDecision = Boolean(existing?.decision);
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(sampleApprovals)
        .set({ url, note, uploadedBy: member.user.id, decision: null, decisionNote: "", decidedBy: null, decidedAt: null, updatedAt: new Date() })
        .where(eq(sampleApprovals.id, existing.id));
    } else {
      await tx.insert(sampleApprovals).values({ workspaceId: member.workspace.id, programId: program.id, url, note, uploadedBy: member.user.id });
    }
    await recordActivity(tx, member, program.id, "sampleSent",
      `Sent sample photos for approval${hadDecision ? ". This replaces the earlier submission" : ""}`);
  });
  // A replaced photo frees the old one's storage.
  if (existing && existing.url !== url) await forgetUpload(db, existing.url);
}

export async function decideSample(db: Db, member: Member, input: { programId: string; decision: string; note: string }): Promise<void> {
  assertCan(member.membership.role, "samples.decide");
  const program = await findVisibleProgram(db, member, input.programId);
  const [row] = await db.select().from(sampleApprovals).where(eq(sampleApprovals.programId, program.id));
  if (!row) throw new InputError("No sample photos have been sent yet.");
  if (row.decision) throw new InputError("This submission already has a decision.");
  if (input.decision !== "approved" && input.decision !== "changesRequested") throw new InputError("Choose approve or request changes.");
  const note = input.note.trim().slice(0, 1000);
  if (input.decision === "changesRequested" && !note) throw new InputError("Say what needs to change, so the vendor can act on it.");
  await db.transaction(async (tx) => {
    await tx.update(sampleApprovals)
      .set({ decision: input.decision as "approved" | "changesRequested", decisionNote: note, decidedBy: member.user.id, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(sampleApprovals.id, row.id));
    await recordActivity(tx, member, program.id, "sampleDecided",
      input.decision === "approved" ? "Approved the sample photos" : `Requested changes to the sample photos. “${note}”`);
  });
}
