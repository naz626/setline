import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { memberships, workspaces } from "@/lib/db/schema";
import type { MembershipRow, UserRow, WorkspaceRow } from "@/lib/db/schema";

/** A signed-in person acting inside one workspace. Every service takes this so data access is always scoped. */
export interface Member {
  user: UserRow;
  membership: MembershipRow;
  workspace: WorkspaceRow;
}

/** A person's workspace. People belong to one workspace for now; the oldest membership wins if there are several. */
export async function findMember(db: Db, user: UserRow): Promise<Member | undefined> {
  const [row] = await db
    .select({ membership: memberships, workspace: workspaces })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  return row ? { user, ...row } : undefined;
}
