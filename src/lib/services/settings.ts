import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashToken } from "@/lib/auth/core";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { memberships, workspaces } from "@/lib/db/schema";
import type { Role, WorkspaceRow } from "@/lib/db/schema";
import { assertAlertsIncluded } from "./billing";
import { InputError } from "./errors";
import type { Member } from "./member";

/** The kinds of notification email, with who can receive each. */
export const NOTICE_CHOICES: { type: string; label: string; detail: string; roles: Role[] }[] = [
  { type: "vendorStatus", label: "Vendor status updates", detail: "When a vendor sets Working, Waiting on you or Backlogged on a program you own.", roles: ["brandAdmin", "programManager"] },
  { type: "proofSent", label: "Quotes and proofs to review", detail: "When a new version is sent for approval.", roles: ["brandAdmin", "programManager", "reviewer"] },
  { type: "proofDecided", label: "Decisions on quotes and proofs", detail: "When something you sent is approved or sent back.", roles: ["brandAdmin", "programManager", "designer", "vendorGuest"] },
  { type: "submittedToVendor", label: "New programs", detail: "When a brand submits a program to you.", roles: ["vendorGuest"] },
  { type: "changeLogged", label: "Changes to a program", detail: "When the brand logs a change on one of your programs.", roles: ["vendorGuest"] },
];

export function noticeChoicesFor(role: Role) {
  return NOTICE_CHOICES.filter((choice) => choice.roles.includes(role));
}

/** Saves which notification emails this person wants. Anything they can receive and did not tick is switched off. */
export async function setNoticePreferences(db: Db, member: Member, wanted: string[]): Promise<void> {
  const muted = noticeChoicesFor(member.membership.role).map((choice) => choice.type).filter((type) => !wanted.includes(type));
  await db.update(memberships).set({ mutedNotices: muted }).where(eq(memberships.id, member.membership.id));
}

const WEBHOOK_HOSTS = [/^hooks\.slack\.com$/, /\.webhook\.office\.com$/];

/** Sets or clears the Slack or Teams address that receives alerts. Only known webhook hosts are accepted. */
export async function setAlertWebhook(db: Db, member: Member, value: string): Promise<void> {
  assertCan(member.membership.role, "integrations.manage");
  const trimmed = value.trim();
  let alertWebhookUrl: string | null = null;
  if (trimmed !== "") {
    assertAlertsIncluded(member);
    let url: URL | undefined;
    try {
      url = new URL(trimmed);
    } catch {}
    if (!url || url.protocol !== "https:" || trimmed.length > 1000 || !WEBHOOK_HOSTS.some((host) => host.test(url.hostname))) {
      throw new InputError("Paste the incoming webhook address from Slack (it starts with https://hooks.slack.com/) or from Microsoft Teams.");
    }
    alertWebhookUrl = url.toString();
  }
  await db.update(workspaces).set({ alertWebhookUrl }).where(eq(workspaces.id, member.workspace.id));
}

/**
 * Creates a new secret calendar address for the workspace and returns the secret. Any earlier address stops working.
 * Only a hash is stored, so the address can be shown once.
 */
export async function createCalendarToken(db: Db, member: Member): Promise<string> {
  assertCan(member.membership.role, "integrations.manage");
  assertAlertsIncluded(member);
  const token = randomBytes(24).toString("base64url");
  await db.update(workspaces).set({ calendarTokenHash: hashToken(token) }).where(eq(workspaces.id, member.workspace.id));
  return token;
}

export async function removeCalendarToken(db: Db, member: Member): Promise<void> {
  assertCan(member.membership.role, "integrations.manage");
  await db.update(workspaces).set({ calendarTokenHash: null }).where(eq(workspaces.id, member.workspace.id));
}

export async function findWorkspaceByCalendarToken(db: Db, token: string): Promise<WorkspaceRow | undefined> {
  if (!/^[\w-]{20,64}$/.test(token)) return undefined;
  const [workspace] = await db.select().from(workspaces).where(and(eq(workspaces.calendarTokenHash, hashToken(token))));
  return workspace;
}
