import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken } from "@/lib/auth/core";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { addDays } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import {
  ReadOnlyError, assertWritable, dueTrialReminders, extendTrial, isOperator, listWorkspacesForOperator, markTrialReminderSent, memberPlanState,
  setFounding, setWorkspacePlan, workspaceUsage,
} from "./billing";
import { findMember } from "./member";
import type { Member } from "./member";
import { buildNotice } from "./notices";
import { completeNextMilestone, createProgram, importPrograms } from "./programs";
import { createCalendarToken, setAlertWebhook } from "./settings";
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
