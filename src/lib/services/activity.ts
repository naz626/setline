import { desc, eq } from "drizzle-orm";
import { assertBrand } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { activityEvents, users } from "@/lib/db/schema";
import type { ProgramRow } from "@/lib/db/schema";
import type { Member } from "./member";

export type ActivityType =
  | "created" | "milestone" | "vendorAssigned" | "dateMoved" | "leadTimes"
  | "vendorStatus" | "proofSent" | "proofDecided" | "file" | "details" | "change" | "store" | "retailer";

/** Anything with insert: the database or an open transaction. */
type Writer = Pick<Db, "insert">;

/** Adds one line to a program's history. Call it in the same transaction as the change it describes. */
export async function recordActivity(db: Writer, member: Member, programId: string, type: ActivityType, summary: string): Promise<void> {
  await db.insert(activityEvents).values({ workspaceId: member.workspace.id, programId, actorId: member.user.id, type, summary: summary.slice(0, 500) });
}

/** A program's history, newest first. Brand team only. Pass a program the person is already allowed to see. */
export async function listActivity(db: Db, member: Member, program: ProgramRow, limit = 30) {
  assertBrand(member.membership.role);
  return db
    .select({ id: activityEvents.id, type: activityEvents.type, summary: activityEvents.summary, createdAt: activityEvents.createdAt, by: users.email })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .where(eq(activityEvents.programId, program.id))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
}
