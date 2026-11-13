import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { invitations, loginTokens, memberships, sessions, users } from "@/lib/db/schema";
import type { UserRow } from "@/lib/db/schema";

export const LOGIN_TOKEN_MINUTES = 15;
export const SESSION_DAYS = 30;
const MAX_ACTIVE_LINKS_PER_EMAIL = 5;

export class AuthError extends Error {}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function normalizeEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Enter a valid email address.");
  }
  return email;
}

/** Creates a one-time sign-in token for an email. Returns the raw token, which is only ever sent to that inbox. */
export async function createLoginToken(db: Db, emailInput: string, now: Date = new Date()): Promise<{ email: string; token: string }> {
  const email = normalizeEmail(emailInput);
  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)));
  if (active >= MAX_ACTIVE_LINKS_PER_EMAIL) {
    throw new AuthError("Too many sign-in links were requested. Use the latest email or try again in a few minutes.");
  }
  const token = newToken();
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    email,
    expiresAt: new Date(now.getTime() + LOGIN_TOKEN_MINUTES * 60_000),
  });
  return { email, token };
}

/**
 * Exchanges a sign-in token for a session. A token works once and only before it expires.
 * Creates the user on first sign-in and accepts any invitations waiting for that email.
 */
export async function consumeLoginToken(db: Db, token: string, now: Date = new Date()): Promise<{ sessionToken: string; expiresAt: Date; user: UserRow }> {
  const [used] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, hashToken(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ email: loginTokens.email });
  if (!used) throw new AuthError("This sign-in link has expired or was already used. Request a new one.");

  await db.insert(users).values({ email: used.email }).onConflictDoNothing({ target: users.email });
  const [user] = await db.select().from(users).where(eq(users.email, used.email));

  const pending = await db.select().from(invitations).where(and(eq(invitations.email, user.email), isNull(invitations.acceptedAt)));
  for (const invite of pending) {
    await db
      .insert(memberships)
      .values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role, vendorId: invite.vendorId, retailer: invite.retailer })
      .onConflictDoNothing();
    await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invite.id));
  }

  const sessionToken = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(sessionToken), userId: user.id, expiresAt });
  return { sessionToken, expiresAt, user };
}

export async function getSessionUser(db: Db, sessionToken: string, now: Date = new Date()): Promise<UserRow | undefined> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), gt(sessions.expiresAt, now)));
  return row?.user;
}

export async function deleteSession(db: Db, sessionToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(sessionToken)));
}
