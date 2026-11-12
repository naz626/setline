import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { isBrandRole } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { invitations, memberships, programs, users, workspaces } from "@/lib/db/schema";
import type { Role, WorkspaceRow } from "@/lib/db/schema";
import { FOUNDING_PLACES, TRIAL_DAYS, TRIAL_EXTENSION_DAYS, TRIAL_REMINDER_DAYS, isPlanId, planState, trialDay } from "@/lib/plans";
import type { PlanState } from "@/lib/plans";
import { InputError } from "./errors";
import type { Member } from "./member";

const BRAND_ROLES: Role[] = ["brandAdmin", "programManager", "designer", "reviewer"];

/** The trial has ended and no plan has been chosen. The message is safe to show. */
export class ReadOnlyError extends Error {
  constructor(admin: boolean) {
    super(admin
      ? "Your free trial has ended, so this workspace is read-only. Choose a plan on the Billing page to carry on. Nothing has been deleted."
      : "This workspace's free trial has ended, so it is read-only for now. Its admin can choose a plan to switch it back on.");
    this.name = "ReadOnlyError";
  }
}

export function memberPlanState(member: Member, now = new Date()): PlanState {
  return planState(member.workspace, now);
}

/** Call before any change. Reading stays possible after a trial ends; changing things does not. */
export function assertWritable(member: Member, now = new Date()): void {
  if (memberPlanState(member, now).status === "expired") throw new ReadOnlyError(member.membership.role === "brandAdmin");
}

export interface Usage {
  /** Brand team members plus brand invitations not yet accepted. Guests are free and not counted. */
  seats: number;
  /** Programs not yet in store. */
  openPrograms: number;
}

export async function workspaceUsage(db: Db, workspaceId: string): Promise<Usage> {
  const [[members], [pending], [open]] = await Promise.all([
    db.select({ n: count() }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.role, BRAND_ROLES))),
    db.select({ n: count() }).from(invitations).where(and(eq(invitations.workspaceId, workspaceId), inArray(invitations.role, BRAND_ROLES), isNull(invitations.acceptedAt))),
    db.select({ n: count() }).from(programs).where(and(eq(programs.workspaceId, workspaceId), sql`${programs.completed} ->> 'inStore' is null`)),
  ]);
  return { seats: members.n + pending.n, openPrograms: open.n };
}

/** Refuses a new brand seat when the plan is full. Guests never count. */
export async function assertSeatAvailable(db: Db, member: Member, role: Role): Promise<void> {
  if (!isBrandRole(role)) return;
  const { plan } = memberPlanState(member);
  if (plan.seats === undefined) return;
  const { seats } = await workspaceUsage(db, member.workspace.id);
  if (seats >= plan.seats) throw new InputError(`The ${plan.name} plan includes ${plan.seats} brand team seats and all are in use. Vendor and retailer guests are always free. Change plan on the Billing page to add more people.`);
}

/** Refuses new open programs beyond the plan's limit. `adding` is how many are about to be created. */
export async function assertProgramRoom(db: Db, member: Member, adding = 1): Promise<void> {
  const { plan } = memberPlanState(member);
  if (plan.openPrograms === undefined) return;
  const { openPrograms } = await workspaceUsage(db, member.workspace.id);
  if (openPrograms + adding > plan.openPrograms) throw new InputError(`The ${plan.name} plan covers ${plan.openPrograms} open programs at once and you have ${openPrograms}. Finish one, or change plan on the Billing page.`);
}

export function assertAlertsIncluded(member: Member): void {
  const { plan } = memberPlanState(member);
  if (!plan.alerts) throw new InputError(`Slack or Teams alerts and the calendar feed are part of the Team plan. You are on ${plan.name}.`);
}

/* The operator: the people who run Setline itself. Until card checkout exists, they set a workspace's plan by hand
   once it has paid. Operators are named by email in SETLINE_OPERATOR_EMAILS and nothing else grants this. */

export function isOperator(email: string, env = process.env): boolean {
  return (env.SETLINE_OPERATOR_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

function assertOperator(email: string): void {
  if (!isOperator(email)) throw new InputError("Only Setline's operators can do that.");
}

export async function listWorkspacesForOperator(db: Db, operatorEmail: string) {
  assertOperator(operatorEmail);
  const rows = await db.select().from(workspaces).orderBy(asc(workspaces.createdAt));
  return Promise.all(rows.map(async (workspace) => {
    const [usage, admins] = await Promise.all([
      workspaceUsage(db, workspace.id),
      db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.workspaceId, workspace.id), eq(memberships.role, "brandAdmin"))),
    ]);
    return { workspace, usage, admins: admins.map((a) => a.email), state: planState(workspace, new Date()) };
  }));
}

async function findWorkspace(db: Db, workspaceId: string): Promise<WorkspaceRow> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new InputError("That workspace no longer exists.");
  return workspace;
}

export async function setWorkspacePlan(db: Db, operatorEmail: string, workspaceId: string, plan: string): Promise<void> {
  assertOperator(operatorEmail);
  if (!isPlanId(plan)) throw new InputError("Choose a plan.");
  await findWorkspace(db, workspaceId);
  await db.update(workspaces).set({ plan }).where(eq(workspaces.id, workspaceId));
}

/** The one 14-day extension a trial can have, counted from its current end or from now if it has already ended. */
export async function extendTrial(db: Db, operatorEmail: string, workspaceId: string, now = new Date()): Promise<void> {
  assertOperator(operatorEmail);
  const workspace = await findWorkspace(db, workspaceId);
  if (workspace.plan !== "trial") throw new InputError("That workspace is not on a trial.");
  if (workspace.trialExtended) throw new InputError("That trial has already had its one extension.");
  const from = Math.max(workspace.trialEndsAt.getTime(), now.getTime());
  await db.update(workspaces).set({ trialEndsAt: new Date(from + TRIAL_EXTENSION_DAYS * 86_400_000), trialExtended: true }).where(eq(workspaces.id, workspaceId));
}

export async function setFounding(db: Db, operatorEmail: string, workspaceId: string, founding: boolean): Promise<void> {
  assertOperator(operatorEmail);
  const workspace = await findWorkspace(db, workspaceId);
  if (founding && !workspace.founding) {
    const [taken] = await db.select({ n: count() }).from(workspaces).where(eq(workspaces.founding, true));
    if (taken.n >= FOUNDING_PLACES) throw new InputError(`All ${FOUNDING_PLACES} founding places are taken.`);
  }
  await db.update(workspaces).set({ founding }).where(eq(workspaces.id, workspaceId));
}

export interface TrialReminder {
  workspace: WorkspaceRow;
  key: string;
  daysLeft: number;
  to: string[];
  usage: Usage;
}

/** Trial reminders that are due and not yet sent. Mark each one sent with `markTrialReminderSent`. */
export async function dueTrialReminders(db: Db, now = new Date()): Promise<TrialReminder[]> {
  const trials = await db.select().from(workspaces).where(eq(workspaces.plan, "trial"));
  const due: TrialReminder[] = [];
  for (const workspace of trials) {
    const state = planState(workspace, now);
    if (state.status !== "trialing") continue;
    const day = trialDay(workspace.trialEndsAt, now, TRIAL_DAYS + (workspace.trialExtended ? TRIAL_EXTENSION_DAYS : 0));
    // The latest reminder whose day has come; an earlier one that was missed is not sent late on top of it.
    const reached = [...TRIAL_REMINDER_DAYS].reverse().find((d) => day >= d);
    if (!reached) continue;
    const key = `day${reached}`;
    if (workspace.trialReminders.includes(key)) continue;
    const admins = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.workspaceId, workspace.id), eq(memberships.role, "brandAdmin")));
    due.push({ workspace, key, daysLeft: state.trialDaysLeft ?? 0, to: admins.map((a) => a.email), usage: await workspaceUsage(db, workspace.id) });
  }
  return due;
}

export async function markTrialReminderSent(db: Db, reminder: TrialReminder): Promise<void> {
  const keys = TRIAL_REMINDER_DAYS.map((d) => `day${d}`);
  // Sending a later reminder also closes the earlier ones.
  const done = keys.slice(0, keys.indexOf(reminder.key) + 1);
  await db.update(workspaces).set({ trialReminders: [...new Set([...reminder.workspace.trialReminders, ...done])] }).where(eq(workspaces.id, reminder.workspace.id));
}
