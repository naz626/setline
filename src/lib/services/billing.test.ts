import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken } from "@/lib/auth/core";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { programs, vendors, workspaces } from "@/lib/db/schema";
import { addDays } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import {
  ReadOnlyError, applyCheckoutCompleted, applySubscriptionCanceled, applySubscriptionUpdated, assertWritable, beginCheckout, deleteWorkspace,
  dueForDeletion, dueForDeletionWarning, dueTrialReminders, extendTrial, isOperator, listWorkspacesForOperator, markDeletionWarned,
  markTrialReminderSent, memberPlanState, setFounding, setWorkspacePlan, workspaceUsage,
} from "./billing";
import { InputError } from "./errors";
import { ForbiddenError } from "@/lib/auth/permissions";
import { findMember } from "./member";
import type { Member } from "./member";
import { buildNotice } from "./notices";
import { completeNextMilestone, createProgram, importPrograms } from "./programs";
import { createCalendarToken, setAlertWebhook } from "./settings";
import { assertStorageAvailable, forgetUpload, recordUpload, storageUsedBytes } from "./storage";
import { inviteMember } from "./team";
import { createVendor } from "./vendors";
import { createWorkspace } from "./workspace";

const OPERATOR = "owner@setline.test";
const DAY = 86_400_000;
let db: Db;
let today: string;

async function newWorkspace(email: string, name: string): Promise<Member> {
  const { token } = await createLoginToken(db, email);
  const { user } = await consumeLoginToken(db, token);
  await createWorkspace(db, user, { name, timezone: "America/New_York", withSamples: false });
  return (await findMember(db, user))!;
}
const reload = async (member: Member) => (await findMember(db, member.user))!;
const program = (member: Member, name: string, extra: object = {}) =>
  createProgram(db, member, { name, retailer: "", displayType: "Endcap", storeCount: "", inStoreDate: addDays(today, 200), vendorId: "", ...extra });

beforeAll(async () => {
  process.env.SETLINE_OPERATOR_EMAILS = ` ${OPERATOR}, second@setline.test`;
  db = await createLocalDb("memory://");
  today = todayInZone("America/New_York");
});

describe("trial", () => {
  it("starts a new workspace on a 30-day trial with every Team feature", async () => {
    const admin = await newWorkspace("a@brand.test", "Trial Brand");
    expect(memberPlanState(admin)).toMatchObject({ status: "trialing", trialDaysLeft: 30, plan: { id: "trial", alerts: true } });
    assertWritable(admin);
    await setAlertWebhook(db, admin, "https://hooks.slack.com/services/T/B/x");
    await createCalendarToken(db, admin);
  });

  it("goes read-only when it ends, and an operator can extend it once", async () => {
    let admin = await newWorkspace("b@brand.test", "Ended Brand");
    await db.update(workspaces).set({ trialEndsAt: new Date(Date.now() - DAY) }).where(eq(workspaces.id, admin.workspace.id));
    admin = await reload(admin);
    expect(memberPlanState(admin).status).toBe("expired");
    expect(() => assertWritable(admin)).toThrow(ReadOnlyError);
    expect(() => assertWritable(admin)).toThrow(/Choose a plan/);

    await expect(extendTrial(db, "b@brand.test", admin.workspace.id)).rejects.toThrow(/operators/);
    await extendTrial(db, OPERATOR, admin.workspace.id);
    admin = await reload(admin);
    expect(memberPlanState(admin)).toMatchObject({ status: "trialing", trialDaysLeft: 14 });
    await expect(extendTrial(db, OPERATOR, admin.workspace.id)).rejects.toThrow(/already had/);
  });

  it("sends each reminder once, on day 20 and day 28", async () => {
    const admin = await newWorkspace("c@brand.test", "Reminder Brand");
    const start = admin.workspace.trialEndsAt.getTime() - 30 * DAY;
    const mine = async (day: number) => (await dueTrialReminders(db, new Date(start + (day - 1) * DAY + 3_600_000))).filter((r) => r.workspace.id === admin.workspace.id);
    expect(await mine(19)).toEqual([]);
    const [first] = await mine(20);
    expect(first).toMatchObject({ key: "day20", daysLeft: 11, to: ["c@brand.test"] });
    await markTrialReminderSent(db, first);
    expect(await mine(21)).toEqual([]);
    const [second] = await mine(28);
    expect(second).toMatchObject({ key: "day28", daysLeft: 3 });
    await markTrialReminderSent(db, second);
    expect(await mine(29)).toEqual([]);
    expect(await mine(31)).toEqual([]);
  });
});

describe("plan limits", () => {
  let admin: Member;

  it("only lets an operator set a plan", async () => {
    admin = await newWorkspace("d@brand.test", "Starter Brand");
    expect(isOperator("D@brand.test")).toBe(false);
    expect(isOperator("OWNER@setline.test")).toBe(true);
    await expect(setWorkspacePlan(db, "d@brand.test", admin.workspace.id, "team")).rejects.toThrow(/operators/);
    await expect(listWorkspacesForOperator(db, "d@brand.test")).rejects.toThrow(/operators/);
    await expect(setWorkspacePlan(db, OPERATOR, admin.workspace.id, "platinum")).rejects.toThrow(/Choose a plan/);
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "starter");
    admin = await reload(admin);
    expect(memberPlanState(admin)).toMatchObject({ status: "active", plan: { id: "starter" } });
    const row = (await listWorkspacesForOperator(db, OPERATOR)).find((r) => r.workspace.id === admin.workspace.id)!;
    expect(row).toMatchObject({ admins: ["d@brand.test"], usage: { seats: 1, openPrograms: 0 } });
  });

  it("caps brand seats on Starter but never guests", async () => {
    for (const n of [1, 2, 3, 4]) await inviteMember(db, admin, { email: `m${n}@brand.test`, role: "designer", vendorId: "" });
    expect((await workspaceUsage(db, admin.workspace.id)).seats).toBe(5);
    await expect(inviteMember(db, admin, { email: "m5@brand.test", role: "reviewer", vendorId: "" })).rejects.toThrow(/5 brand team seats/);
    const vendorId = await createVendor(db, admin, { name: "Acme", makes: "", origin: "domestic", process: "corrugate" });
    for (const n of [1, 2, 3, 4, 5, 6]) await inviteMember(db, admin, { email: `rep${n}@acme.test`, role: "vendorGuest", vendorId });
    await inviteMember(db, admin, { email: "buyer@retailer.test", role: "retailerGuest", vendorId: "", retailer: "Northline" });
    expect((await workspaceUsage(db, admin.workspace.id)).seats).toBe(5);
  });

  it("caps storage on Starter's 10 GB, frees space when a file is forgotten, and never caps Enterprise", async () => {
    const GB = 1024 * 1024 * 1024;
    await assertStorageAvailable(db, admin); // nothing used yet
    await recordUpload(db, admin.workspace.id, "w/x/a.pdf", 9 * GB);
    expect(await storageUsedBytes(db, admin.workspace.id)).toBe(9 * GB);
    await assertStorageAvailable(db, admin); // still under 10 GB
    await recordUpload(db, admin.workspace.id, "w/x/b.pdf", 2 * GB);
    expect(await storageUsedBytes(db, admin.workspace.id)).toBe(11 * GB);
    await expect(assertStorageAvailable(db, admin)).rejects.toThrow(InputError);
    await expect(assertStorageAvailable(db, admin)).rejects.toThrow(/10 GB/);
    // Forgetting a file frees its space, bringing the workspace back under the limit.
    await forgetUpload(db, "blob:w/x/b.pdf");
    expect(await storageUsedBytes(db, admin.workspace.id)).toBe(9 * GB);
    await assertStorageAvailable(db, admin);
    // A plain https link is not ours to free; forgetting it is a no-op.
    await forgetUpload(db, "https://files.test/x.pdf");
    expect(await storageUsedBytes(db, admin.workspace.id)).toBe(9 * GB);
    // Enterprise has no storage cap.
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "enterprise");
    const enterpriseAdmin = await reload(admin);
    await recordUpload(db, admin.workspace.id, "w/x/c.pdf", 500 * GB);
    await assertStorageAvailable(db, enterpriseAdmin);
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "starter");
    admin = await reload(admin);
    await forgetUpload(db, "blob:w/x/a.pdf");
    await forgetUpload(db, "blob:w/x/c.pdf");
  });

  it("caps open programs on Starter, counting imports, and frees a place when one is in store", async () => {
    for (let n = 1; n <= 14; n += 1) await program(admin, `P${n}`);
    const date = addDays(today, 200);
    await expect(importPrograms(db, admin, `I1, , Endcap, ${date}\nI2, , Endcap, ${date}`)).rejects.toThrow(/15 open programs/);
    expect((await workspaceUsage(db, admin.workspace.id)).openPrograms).toBe(14);
    const finishing = await createVendor(db, admin, { name: "Finisher", makes: "", origin: "domestic", process: "print" });
    const last = await program(admin, "P15", { vendorId: finishing });
    await expect(program(admin, "P16")).rejects.toThrow(/15 open programs at once and you have 15/);
    for (const key of ["submit", "quoteApproved", "structuralProofApproved", "printProofApproved", "productionComplete", "shipped", "inStore"]) await completeNextMilestone(db, admin, last, key);
    await program(admin, "P16");
  });

  it("keeps alerts and the calendar feed for Team and trial", async () => {
    await expect(setAlertWebhook(db, admin, "https://hooks.slack.com/services/T/B/x")).rejects.toThrow(/Team plan/);
    await expect(createCalendarToken(db, admin)).rejects.toThrow(/Team plan/);
    await setAlertWebhook(db, admin, "");
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "team");
    admin = await reload(admin);
    await setAlertWebhook(db, admin, "https://hooks.slack.com/services/T/B/x");
    await inviteMember(db, admin, { email: "m5@brand.test", role: "reviewer", vendorId: "" });
    // Dropping back to Starter keeps the saved address but stops using it.
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "starter");
    admin = await reload(admin);
    const vendorId = await createVendor(db, admin, { name: "Other", makes: "", origin: "domestic", process: "print" });
    await setWorkspacePlan(db, OPERATOR, admin.workspace.id, "team");
    const teamAdmin = await reload(admin);
    const id = await program(teamAdmin, "Alerted", { vendorId, submitNow: true });
    expect((await buildNotice(db, teamAdmin, { type: "submittedToVendor", programId: id }))!.alertWebhookUrl).toContain("hooks.slack.com");
    expect((await buildNotice(db, admin, { type: "submittedToVendor", programId: id }))!.alertWebhookUrl).toBeUndefined();
  });

  it("limits the founding offer to ten brands", async () => {
    const made: Member[] = [];
    for (let n = 0; n < 11; n += 1) made.push(await newWorkspace(`f${n}@brand.test`, `Founding ${n}`));
    for (const member of made.slice(0, 10)) await setFounding(db, OPERATOR, member.workspace.id, true);
    await expect(setFounding(db, OPERATOR, made[10].workspace.id, true)).rejects.toThrow(/All 10 founding places/);
    await setFounding(db, OPERATOR, made[0].workspace.id, false);
    await setFounding(db, OPERATOR, made[10].workspace.id, true);
  });
});

describe("card checkout", () => {
  it("only a brand admin can start checkout, and only when Stripe is configured", async () => {
    const admin = await newWorkspace("checkout-admin@brand.test", "Checkout Co");
    await inviteMember(db, admin, { email: "pm@checkout.test", role: "programManager", vendorId: "" });
    const { token } = await createLoginToken(db, "pm@checkout.test");
    const { user } = await consumeLoginToken(db, token);
    const manager = (await findMember(db, user))!;
    await expect(beginCheckout(db, manager, { plan: "starter", interval: "monthly", successUrl: "https://x.test/s", cancelUrl: "https://x.test/c" })).rejects.toThrow(ForbiddenError);
    // STRIPE_SECRET_KEY is not set in tests, so this is as far as checkout can get without a live Stripe account.
    await expect(beginCheckout(db, admin, { plan: "starter", interval: "monthly", successUrl: "https://x.test/s", cancelUrl: "https://x.test/c" })).rejects.toThrow(/not set up/);
  });

  it("applies a completed checkout, a plan change, and a cancellation from webhook payloads", async () => {
    let admin = await newWorkspace("stripe-admin@brand.test", "Stripe Co");
    const workspaceId = admin.workspace.id;

    await applyCheckoutCompleted(db, { customer: "cus_123", subscription: "sub_123", metadata: { workspaceId, plan: "starter" } });
    let [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(row).toMatchObject({ plan: "starter", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" });

    // A plan change at Stripe (e.g. upgrading in the billing portal) carries over on the next subscription.updated.
    await applySubscriptionUpdated(db, { id: "sub_456", customer: "cus_123", status: "active", metadata: { plan: "team" } });
    [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(row).toMatchObject({ plan: "team", stripeSubscriptionId: "sub_456" });

    // A payload for a customer nobody recognizes is just ignored, not an error.
    await applySubscriptionUpdated(db, { id: "sub_999", customer: "cus_unknown", status: "active", metadata: { plan: "team" } });

    // Cancellation reuses the trial's read-only machinery: no plan chosen, same as an unpaid trial.
    await applySubscriptionUpdated(db, { id: "sub_456", customer: "cus_123", status: "canceled" });
    [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(row).toMatchObject({ plan: "trial", stripeSubscriptionId: null });
    expect(row!.trialEndsAt.getTime()).toBeLessThanOrEqual(Date.now());
    admin = await reload(admin);
    expect(() => assertWritable(admin)).toThrow(ReadOnlyError);

    // A second cancellation (a stray retry) is a no-op, not a second reset of trialEndsAt.
    const endedAt = row!.trialEndsAt.getTime();
    await applySubscriptionCanceled(db, "cus_123");
    [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(row!.trialEndsAt.getTime()).toBe(endedAt);
  });
});

describe("deleting unpaid workspaces", () => {
  const DAY = 86_400_000;
  // A minute of slack past the exact day boundary, so the comparison in dueForDeletion(Warning) isn't a coin flip on timing.
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY - 60_000);

  it("warns once, 7 days before the 60-day cutoff, then deletes once it is reached", async () => {
    const member = await newWorkspace("owner@expired.test", "Expired Brand");
    const vendorId = await createVendor(db, member, { name: "V", makes: "", origin: "domestic", process: "print" });
    const programId = await program(member, "P1", { vendorId });

    expect(await dueForDeletionWarning(db)).toHaveLength(0); // trial has not even ended yet
    await expect(dueForDeletion(db)).resolves.toEqual([]);

    // 53 days unpaid since expiry: 7 days left before the 60-day cutoff, so the warning is now due.
    await db.update(workspaces).set({ trialEndsAt: daysAgo(53) }).where(eq(workspaces.id, member.workspace.id));
    const [warning] = await dueForDeletionWarning(db);
    expect(warning).toMatchObject({ daysLeft: 7, to: ["owner@expired.test"] });
    await expect(dueForDeletion(db)).resolves.toEqual([]); // not due for deletion yet

    await markDeletionWarned(db, member.workspace.id);
    expect(await dueForDeletionWarning(db)).toHaveLength(0); // sent once

    // 61 days unpaid: past the 60-day cutoff.
    await db.update(workspaces).set({ trialEndsAt: daysAgo(61) }).where(eq(workspaces.id, member.workspace.id));
    const due = await dueForDeletion(db);
    expect(due.map((w) => w.id)).toContain(member.workspace.id);

    await deleteWorkspace(db, member.workspace.id);
    const [gone] = await db.select().from(workspaces).where(eq(workspaces.id, member.workspace.id));
    expect(gone).toBeUndefined();
    // Everything that hung off the workspace is gone too, cascaded from the workspace row.
    expect(await db.select().from(vendors).where(eq(vendors.id, vendorId))).toHaveLength(0);
    expect(await db.select().from(programs).where(eq(programs.id, programId))).toHaveLength(0);
  });

  it("resets the deletion warning when a trial is extended", async () => {
    const member = await newWorkspace("owner@extend2.test", "Extend Brand 2");
    await db.update(workspaces).set({ trialEndsAt: daysAgo(54), deletionWarnedAt: new Date() }).where(eq(workspaces.id, member.workspace.id));
    expect(await dueForDeletionWarning(db)).toHaveLength(0); // already warned
    await extendTrial(db, OPERATOR, member.workspace.id);
    expect(await dueForDeletionWarning(db)).toHaveLength(0); // pushed out, nowhere near the new warning window
    const [refreshed] = await db.select().from(workspaces).where(eq(workspaces.id, member.workspace.id));
    expect(refreshed.deletionWarnedAt).toBeNull();
  });

  it("never deletes a workspace that paid before its grace period ran out", async () => {
    const member = await newWorkspace("owner@paid.test", "Paid In Time");
    await db.update(workspaces).set({ trialEndsAt: daysAgo(61) }).where(eq(workspaces.id, member.workspace.id));
    await setWorkspacePlan(db, OPERATOR, member.workspace.id, "starter");
    const due = await dueForDeletion(db);
    expect(due.map((w) => w.id)).not.toContain(member.workspace.id);
  });
});
