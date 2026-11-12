import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { memberships, programChanges, programs, proofs, users, vendors } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";
import { PLANS } from "@/lib/plans";
import { formatLong, formatShort } from "@/lib/timeline";
import type { Member } from "./member";
import { PROOF_LABELS } from "./proofs";
import { STATE_WORDS } from "./vendors";

/** Something that just happened which other people should hear about. */
export type NoticeEvent =
  | { type: "submittedToVendor"; programId: string }
  | { type: "vendorStatus"; programId: string }
  | { type: "proofSent"; proofId: string }
  | { type: "proofDecided"; proofId: string }
  | { type: "changeLogged"; changeId: string };

export interface Notice {
  to: string[];
  subject: string;
  /** Plain-text body. The sender adds the link built from `path`. */
  text: string;
  /** Where the email should take people, by audience, because vendors and the brand use different screens. */
  path: { brand: string; vendor: string };
  /** Addresses in `to` that belong to vendor contacts. */
  vendorRecipients: string[];
  /** The workspace's Slack or Teams address, if alerts are connected. */
  alertWebhookUrl?: string;
}

async function emailsWithRoles(db: Db, workspaceId: string, roles: Role[]): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.role, roles)));
  return rows.map((r) => r.email);
}

async function vendorContacts(db: Db, workspaceId: string, vendorId: string | null): Promise<string[]> {
  if (!vendorId) return [];
  const rows = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "vendorGuest"), eq(memberships.vendorId, vendorId)));
  return rows.map((r) => r.email);
}

async function ownerOrLeads(db: Db, workspaceId: string, ownerId: string | null): Promise<string[]> {
  if (ownerId) {
    const [owner] = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, ownerId), inArray(memberships.role, ["brandAdmin", "programManager"])));
    if (owner) return [owner.email];
  }
  return emailsWithRoles(db, workspaceId, ["brandAdmin", "programManager"]);
}

/**
 * Works out who should be emailed about an event and what to say, from the saved state.
 * The person who caused the event is never emailed, and `to` can be empty. Returns undefined when the event is not news.
 */
export async function buildNotice(db: Db, member: Member, event: NoticeEvent): Promise<Notice | undefined> {
  const workspaceId = member.workspace.id;
  let programId: string;
  let proof: typeof proofs.$inferSelect | undefined;
  let change: typeof programChanges.$inferSelect | undefined;
  if (event.type === "proofSent" || event.type === "proofDecided") {
    [proof] = await db.select().from(proofs).where(and(eq(proofs.id, event.proofId), eq(proofs.workspaceId, workspaceId)));
    if (!proof) return undefined;
    programId = proof.programId;
  } else if (event.type === "changeLogged") {
    [change] = await db.select().from(programChanges).where(and(eq(programChanges.id, event.changeId), eq(programChanges.workspaceId, workspaceId)));
    if (!change) return undefined;
    programId = change.programId;
  } else {
    programId = event.programId;
  }
  const [program] = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.workspaceId, workspaceId)));
  if (!program) return undefined;
  const [vendor] = program.vendorId ? await db.select().from(vendors).where(eq(vendors.id, program.vendorId)) : [];
  const contacts = await vendorContacts(db, workspaceId, program.vendorId);
  const fromVendor = member.membership.role === "vendorGuest";
  const brandPath = `/programs/${program.id}`;

  let to: string[] = [];
  let subject = "";
  let text = "";
  let path = { brand: brandPath, vendor: "/vendor" };

  if (event.type === "submittedToVendor") {
    to = contacts;
    subject = `New program from ${member.workspace.name}: ${program.name}`;
    text = `${member.workspace.name} has sent you ${program.name}. It needs to be in store ${formatLong(program.inStoreDate)}.\n\nOpen it to see the key dates and files, and to tell them where things stand.`;
  } else if (event.type === "vendorStatus") {
    // The brand logging a status on the vendor's behalf is not news to the brand.
    if (!fromVendor || !program.vendorState) return undefined;
    to = await ownerOrLeads(db, workspaceId, program.ownerId);
    const start = program.vendorState === "backlogged" && program.backloggedUntil ? ` They can start ${formatShort(program.backloggedUntil)}.` : "";
    subject = `${vendor?.name ?? "Your vendor"} is ${STATE_WORDS[program.vendorState].toLowerCase()} on ${program.name}`;
    text = `${vendor?.name ?? "Your vendor"} set ${program.name} to “${program.vendorState === "waitingOnYou" ? "Waiting on you" : STATE_WORDS[program.vendorState]}”.${start}\n\nOpen the program to see what it does to the in-store date.`;
  } else if (event.type === "proofSent" && proof) {
    const label = `${PROOF_LABELS[proof.kind].toLowerCase()}, version ${proof.version}`;
    to = await emailsWithRoles(db, workspaceId, ["brandAdmin", "programManager", "reviewer"]);
    subject = `Needs a decision: ${PROOF_LABELS[proof.kind].toLowerCase()} for ${program.name}`;
    text = `The ${label}, for ${program.name} is ready for review.${proof.note ? `\n\nNote: ${proof.note}` : ""}\n\nApproving it moves the timeline on.`;
    path = { brand: `/approvals/${proof.id}`, vendor: `/approvals/${proof.id}` };
  } else if (event.type === "proofDecided" && proof) {
    const label = `${PROOF_LABELS[proof.kind].toLowerCase()}, version ${proof.version}`;
    const [uploader] = proof.uploadedBy ? await db.select({ email: users.email }).from(users).where(eq(users.id, proof.uploadedBy)) : [];
    to = [...contacts, ...(uploader ? [uploader.email] : [])];
    const approved = proof.decision === "approved";
    subject = approved ? `Approved: ${PROOF_LABELS[proof.kind].toLowerCase()} for ${program.name}` : `Changes requested: ${PROOF_LABELS[proof.kind].toLowerCase()} for ${program.name}`;
    text = approved
      ? `The ${label}, for ${program.name} was approved.`
      : `Changes were requested on the ${label}, for ${program.name}.\n\n“${proof.decisionNote}”\n\nSend a new version when it is ready.`;
    path = { brand: `/approvals/${proof.id}`, vendor: `/approvals/${proof.id}` };
  } else if (event.type === "changeLogged" && change) {
    to = contacts;
    subject = `Change to ${program.name}`;
    const redo = change.reopened.length > 0 ? `\n\nThis reopens: ${change.reopened.map((kind) => PROOF_LABELS[kind].toLowerCase()).join(", ")}. Please send a new version.` : "";
    text = `${member.workspace.name} changed ${program.name}:\n\n“${change.summary}”${redo}\n\nOpen the program and tap “Got it” so they know you have seen it.`;
  }

  let unique = [...new Set(to)].filter((email) => email !== member.user.email);
  if (unique.length > 0) {
    // Leave out anyone who switched this kind of email off.
    const muted = await db.select({ email: users.email, mutedNotices: memberships.mutedNotices }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspaceId), inArray(users.email, unique)));
    const off = new Set(muted.filter((m) => m.mutedNotices.includes(event.type)).map((m) => m.email));
    unique = unique.filter((email) => !off.has(email));
  }
  return { to: unique, subject, text, path, vendorRecipients: unique.filter((email) => contacts.includes(email)), alertWebhookUrl: (PLANS[member.workspace.plan]?.alerts && member.workspace.alertWebhookUrl) || undefined };
}
