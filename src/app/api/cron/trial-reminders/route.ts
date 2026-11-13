import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { emailConfigured, sendEmail } from "@/lib/email";
import { PLANS } from "@/lib/plans";
import { dueTrialReminders, markTrialReminderSent } from "@/lib/services/billing";

/**
 * Sends the day-20 and day-28 trial reminders. Vercel calls this once a day (see vercel.json) with
 * "Authorization: Bearer CRON_SECRET"; anything else is turned away.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== wanted.length || !timingSafeEqual(given, wanted)) return new Response("Unauthorized", { status: 401 });
  if (!emailConfigured() || !process.env.APP_URL) return Response.json({ sent: 0, skipped: "Email or APP_URL is not set up." });

  const db = await getDb();
  const base = process.env.APP_URL.replace(/\/$/, "");
  let sent = 0;
  for (const reminder of await dueTrialReminders(db)) {
    const { workspace, daysLeft, usage } = reminder;
    const days = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
    const text = [
      `Your free trial of Setline for ${workspace.name} ends in ${days}.`,
      `So far you have ${usage.openPrograms} open ${usage.openPrograms === 1 ? "program" : "programs"} and ${usage.seats} brand team ${usage.seats === 1 ? "seat" : "seats"} in use.`,
      `Plans: Starter is $${PLANS.starter.monthly} a month for up to ${PLANS.starter.seats} people, Team is $${PLANS.team.monthly} a month for up to ${PLANS.team.seats}. Vendor and retailer guests are always free.`,
      "If the trial ends before you choose, the workspace becomes read-only. Nothing is deleted for 60 days.",
      `${base}/settings/billing`,
    ].join("\n\n");
    const results = await Promise.allSettled(reminder.to.map((to) => sendEmail({ to, subject: `Your Setline trial ends in ${days}`, text })));
    // Only close the reminder when at least one admin was reached, so a failed send is tried again tomorrow.
    if (results.some((r) => r.status === "fulfilled")) {
      await markTrialReminderSent(db, reminder);
      sent += 1;
    }
  }
  return Response.json({ sent });
}
