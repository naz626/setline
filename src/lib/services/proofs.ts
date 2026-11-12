import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ForbiddenError, assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { proofComments, proofKindEnum, programs, proofs, users } from "@/lib/db/schema";
import type { ProofKind, ProofRow } from "@/lib/db/schema";
import { MILESTONE_LABELS, nextMilestone } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import type { Member } from "./member";
import { findVisibleProgram, listProgramViews, parseLink } from "./programs";
import type { ProgramView } from "./programs";

export const PROOF_KINDS = proofKindEnum.enumValues;
export const PROOF_LABELS: Record<ProofKind, string> = {
  quoteApproved: "Quote",
  structuralProofApproved: "Structural proof",
  printProofApproved: "Print proof",
};

/** Adds the next version of a quote or proof for the brand to review. */
export async function submitProof(db: Db, member: Member, input: { programId: string; kind: string; url: string; note: string }): Promise<string> {
  assertCan(member.membership.role, "proofs.submit");
  const program = await findVisibleProgram(db, member, input.programId);
  if (!program.vendorId) throw new InputError("Choose a vendor before sending proofs.");
  if (!(PROOF_KINDS as readonly string[]).includes(input.kind)) throw new InputError("Choose what you are sending.");
  const kind = input.kind as ProofKind;
  if (program.completed[kind]) throw new InputError(`The ${PROOF_LABELS[kind].toLowerCase()} is already approved.`);
  const url = parseLink(input.url, "The file link");
  const [latest] = await db.select().from(proofs).where(and(eq(proofs.programId, program.id), eq(proofs.kind, kind))).orderBy(desc(proofs.version)).limit(1);
  if (latest && !latest.decision) throw new InputError(`Version ${latest.version} is still waiting for a decision.`);
  const version = (latest?.version ?? 0) + 1;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(proofs)
      .values({ workspaceId: member.workspace.id, programId: program.id, kind, version, url, note: input.note.trim().slice(0, 1000), uploadedBy: member.user.id })
      .returning({ id: proofs.id });
    await recordActivity(tx, member, program.id, "proofSent", `Sent the ${PROOF_LABELS[kind].toLowerCase()}, version ${version}, for approval`);
    return row.id;
  });
}

function assertSeesProofs(member: Member): void {
  assertCan(member.membership.role, "proofs.view");
}

async function findProof(db: Db, member: Member, proofId: string) {
  assertSeesProofs(member);
  const [proof] = await db.select().from(proofs).where(and(eq(proofs.id, proofId), eq(proofs.workspaceId, member.workspace.id)));
  if (!proof) throw new InputError("That proof no longer exists.");
  // Throws for a vendor guest whose vendor is not on the program.
  const program = await findVisibleProgram(db, member, proof.programId);
  return { proof, program };
}

/**
 * Approves a version or asks for changes. Approving the proof for the next key date completes that date today,
 * so the timeline moves on without a second step.
 */
export async function decideProof(db: Db, member: Member, input: { proofId: string; decision: string; note: string }): Promise<void> {
  assertCan(member.membership.role, "proofs.decide");
  const { proof, program } = await findProof(db, member, input.proofId);
  if (proof.decision) throw new InputError("This version already has a decision.");
  if (input.decision !== "approved" && input.decision !== "changesRequested") throw new InputError("Choose approve or request changes.");
  const note = input.note.trim().slice(0, 1000);
  if (input.decision === "changesRequested" && !note) throw new InputError("Say what needs to change, so the vendor can act on it.");
  await db.transaction(async (tx) => {
    await tx.update(proofs).set({ decision: input.decision as "approved" | "changesRequested", decisionNote: note, decidedBy: member.user.id, decidedAt: new Date() }).where(eq(proofs.id, proof.id));
    const completes = input.decision === "approved" && nextMilestone(program.completed) === proof.kind;
    if (completes) {
      await tx.update(programs).set({ completed: { ...program.completed, [proof.kind]: todayInZone(member.workspace.timezone) } }).where(eq(programs.id, program.id));
    }
    const label = `${PROOF_LABELS[proof.kind].toLowerCase()}, version ${proof.version}`;
    await recordActivity(tx, member, program.id, "proofDecided",
      input.decision === "approved" ? `Approved the ${label}${completes ? `. Completed: ${MILESTONE_LABELS[proof.kind]}` : ""}` : `Requested changes to the ${label}. “${note}”`);
  });
}

export async function addProofComment(db: Db, member: Member, proofId: string, body: string): Promise<void> {
  assertCan(member.membership.role, "proofs.comment");
  const { proof } = await findProof(db, member, proofId);
  const text = body.trim();
  if (!text || text.length > 2000) throw new InputError("Write a comment of up to 2,000 characters.");
  await db.insert(proofComments).values({ workspaceId: member.workspace.id, proofId: proof.id, authorId: member.user.id, body: text });
}

/** One proof with its sibling versions and comments, or undefined if this person may not see it. */
export async function getProofDetail(db: Db, member: Member, proofId: string) {
  let found;
  try {
    found = await findProof(db, member, proofId);
  } catch (error) {
    if (error instanceof InputError || error instanceof ForbiddenError) return undefined;
    throw error;
  }
  const { proof, program } = found;
  const [versions, comments, [uploader]] = await Promise.all([
    db.select().from(proofs).where(and(eq(proofs.programId, program.id), eq(proofs.kind, proof.kind))).orderBy(desc(proofs.version)),
    db.select({ id: proofComments.id, body: proofComments.body, createdAt: proofComments.createdAt, author: users.email })
      .from(proofComments).leftJoin(users, eq(users.id, proofComments.authorId)).where(eq(proofComments.proofId, proof.id)).orderBy(asc(proofComments.createdAt)),
    proof.uploadedBy ? db.select({ email: users.email }).from(users).where(eq(users.id, proof.uploadedBy)) : Promise.resolve([]),
  ]);
  return { proof, program, versions, comments, uploadedBy: uploader?.email };
}

export async function listProofsForProgram(db: Db, member: Member, programId: string): Promise<ProofRow[]> {
  assertSeesProofs(member);
  const program = await findVisibleProgram(db, member, programId);
  return db.select().from(proofs).where(eq(proofs.programId, program.id)).orderBy(asc(proofs.kind), desc(proofs.version));
}

export type ApprovalStatus = "needsDecision" | "changesRequested" | "awaitingProof" | "approved";

export interface ApprovalItem {
  view: ProgramView;
  kind: ProofKind;
  status: ApprovalStatus;
  /** Planned date for this approval. */
  due: string;
  overdue: boolean;
  latest?: ProofRow;
}

/** Where one approval stands, from the program's progress and the latest version sent. */
export function approvalStatus(completed: boolean, latest: ProofRow | undefined): ApprovalStatus {
  if (completed || latest?.decision === "approved") return "approved";
  if (latest && !latest.decision) return "needsDecision";
  if (latest?.decision === "changesRequested") return "changesRequested";
  return "awaitingProof";
}

/** Every approval on the programs this person can see that have a vendor and are not finished. */
export async function listApprovalItems(db: Db, member: Member): Promise<ApprovalItem[]> {
  assertSeesProofs(member);
  const views = (await listProgramViews(db, member)).filter((v) => v.vendor && v.completed.submit && !v.completed.inStore);
  if (views.length === 0) return [];
  const rows = await db.select().from(proofs).where(inArray(proofs.programId, views.map((v) => v.program.id))).orderBy(desc(proofs.version));
  const items: ApprovalItem[] = [];
  for (const view of views) {
    for (const kind of PROOF_KINDS) {
      const latest = rows.find((r) => r.programId === view.program.id && r.kind === kind);
      const status = approvalStatus(Boolean(view.completed[kind]), latest);
      // Approvals that are not up yet and have nothing sent would only add noise.
      if (status === "awaitingProof" && view.next !== kind) continue;
      const due = view.planned[kind];
      items.push({ view, kind, status, due, overdue: status !== "approved" && due < view.today, latest });
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}
