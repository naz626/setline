import { and, asc, eq, isNull } from "drizzle-orm";
import { normalizeEmail } from "@/lib/auth/core";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { invitations, memberships, roleEnum, users, vendors } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";
import { InputError } from "./errors";
import type { Member } from "./member";

export async function listMembers(db: Db, member: Member) {
  return db
    .select({ id: memberships.id, role: memberships.role, email: users.email, userId: users.id, vendorName: vendors.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(vendors, eq(vendors.id, memberships.vendorId))
    .where(eq(memberships.workspaceId, member.workspace.id))
    .orderBy(asc(memberships.createdAt));
}

export async function listPendingInvitations(db: Db, member: Member) {
  return db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, vendorName: vendors.name })
    .from(invitations)
    .leftJoin(vendors, eq(vendors.id, invitations.vendorId))
    .where(and(eq(invitations.workspaceId, member.workspace.id), isNull(invitations.acceptedAt)))
    .orderBy(asc(invitations.createdAt));
}

/** Invites someone by email. They join with this role the first time they sign in with that address. */
export async function inviteMember(db: Db, member: Member, input: { email: string; role: string; vendorId: string }): Promise<{ email: string }> {
  assertCan(member.membership.role, "members.invite");
  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch {
    throw new InputError("Enter a valid email address.");
  }
  if (!(roleEnum.enumValues as readonly string[]).includes(input.role)) throw new InputError("Choose a role.");
  const role = input.role as Role;

  let vendorId: string | null = null;
  if (role === "vendorGuest") {
    const [vendor] = await db.select().from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, member.workspace.id)));
    if (!vendor) throw new InputError("Choose which vendor this guest belongs to.");
    vendorId = vendor.id;
  }

  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, member.workspace.id), eq(users.email, email)));
  if (existing) throw new InputError("That person is already on the team.");

  await db
    .insert(invitations)
    .values({ workspaceId: member.workspace.id, email, role, vendorId, invitedBy: member.user.id })
    .onConflictDoUpdate({ target: [invitations.workspaceId, invitations.email], set: { role, vendorId, invitedBy: member.user.id, acceptedAt: null } });
  return { email };
}

export async function revokeInvitation(db: Db, member: Member, id: string): Promise<void> {
  assertCan(member.membership.role, "members.invite");
  await db.delete(invitations).where(and(eq(invitations.id, id), eq(invitations.workspaceId, member.workspace.id), isNull(invitations.acceptedAt)));
}
