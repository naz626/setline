import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { emailConfigured, sendEmail } from "@/lib/email";
import { DATA_RETENTION_DAYS, DELETION_WARNING_DAYS } from "@/lib/plans";
import { deleteWorkspace, dueForDeletion, dueForDeletionWarning, markDeletionWarned } from "@/lib/services/billing";

/**
 * Warns, then deletes, a trial workspace that has gone unpaid for DATA_RETENTION_DAYS after its
 * trial ended. Vercel calls this once a day (see vercel.json) with "Authorization: Bearer CRON_SECRET";
 * anything else is turned away.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== wanted.length || !timingSafeEqual(given, wanted)) return new Response("Unauthorized", { status: 401 });

  const db = await getDb();
  let warned = 0;
  if (emailConfigured() && process.env.APP_URL) {
    const base = process.env.APP_URL.replace(/\/$/, "");
    for (const warning of await dueForDeletionWarning(db)) {
      const { workspace, daysLeft, to } = warning;
      const text = [
        `${workspace.name}'s free trial on Setline ended and the workspace has been read-only since. Its data will be deleted in ${daysLeft} ${daysLeft === 1 ? "day" : "days"} unless a plan is chosen first.`,
        "Nothing has happened to it yet, and choosing a plan switches it straight back on with everything intact.",
        `${base}/settings/billing`,
      ].join("\n\n");
      // No admins left to warn is still a reason to mark it sent, so the next run moves on to deleting it on schedule.
      const results = to.length > 0 ? await Promise.allSettled(to.map((address) => sendEmail({ to: address, subject: `${workspace.name}'s Setline data will be deleted soon`, text }))) : [];
      if (to.length === 0 || results.some((r) => r.status === "fulfilled")) {
        await markDeletionWarned(db, workspace.id);
        warned += 1;
      }
    }
  }

  let deleted = 0;
  for (const workspace of await dueForDeletion(db)) {
    await deleteWorkspace(db, workspace.id);
    deleted += 1;
  }
  return Response.json({ warned, deleted, retentionDays: DATA_RETENTION_DAYS, warningDays: DELETION_WARNING_DAYS });
}
