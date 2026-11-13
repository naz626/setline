"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AuthError, LOGIN_TOKEN_MINUTES, consumeLoginToken, createLoginToken, deleteSession } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { SESSION_COOKIE, requireMember, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { emailConfigured, sendEmail } from "@/lib/email";
import { acknowledgeChange, logChange } from "@/lib/services/changes";
import { ReadOnlyError, assertWritable, beginBillingPortal, beginCheckout, extendTrial, setFounding, setWorkspacePlan } from "@/lib/services/billing";
import { InputError } from "@/lib/services/errors";
import { createCalendarToken, removeCalendarToken, setAlertWebhook, setNoticePreferences } from "@/lib/services/settings";
import { addProgramFile, removeProgramFile } from "@/lib/services/files";
import { buildNotice } from "@/lib/services/notices";
import type { NoticeEvent } from "@/lib/services/notices";
import { createProfile, deleteProfile, updateProfile } from "@/lib/services/leadTimes";
import type { StepInput } from "@/lib/services/leadTimes";
import { addGuidelineVersion, createGuideline, deleteGuideline } from "@/lib/services/guidelines";
import { assignVendor, completeNextMilestone, createProgram, giveRetailerSignoff, importPrograms, moveInStoreDate, setMilestoneDate, undoMilestone, updateProgramDetails, updateProgramLeadTimes, withdrawRetailerSignoff } from "@/lib/services/programs";
import { addProofComment, decideProof, submitProof } from "@/lib/services/proofs";
import { decideSample, submitSamplePhoto } from "@/lib/services/samples";
import { addStores, markAllStores, markStore, removeStore, resetStore, removeStorePhoto, setStorePhoto } from "@/lib/services/stores";
import { inviteMember, revokeInvitation } from "@/lib/services/team";
import { completeVendorMilestone, createVendor, setVendorStatus } from "@/lib/services/vendors";
import { createWorkspace } from "@/lib/services/workspace";
import { STEPS } from "@/lib/timeline";

export interface FormState {
  error?: string;
  message?: string;
  /** Development only: the sign-in link, shown on screen when email is not set up. */
  devLink?: string;
  /** Something to copy, shown once (the calendar address). */
  secret?: string;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Turns expected problems into a message for the form. Anything unexpected is rethrown. */
function failure(error: unknown): FormState {
  if (error instanceof InputError || error instanceof AuthError || error instanceof ForbiddenError || error instanceof ReadOnlyError) {
    return { error: error.message };
  }
  throw error;
}

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // On Vercel the platform sets these, so they are safe to trust. Previews use their own address.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // Never build sign-in links from request headers in production: a forged Host header could redirect the link.
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL is not set.");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/**
 * Emails the people who should hear about a change, after the response has gone out.
 * A notification that cannot be sent never fails the change that caused it.
 */
async function announce(member: Awaited<ReturnType<typeof requireMember>>, event: NoticeEvent): Promise<void> {
  if (!emailConfigured() && !member.workspace.alertWebhookUrl) return;
  const base = await baseUrl();
  after(async () => {
    try {
      const notice = await buildNotice(await getDb(), member, event);
      if (!notice) return;
      const emails = emailConfigured() ? notice.to : [];
      const results = await Promise.allSettled([
        ...emails.map((to) =>
          sendEmail({ to, subject: notice.subject, text: `${notice.text}\n\n${base}${notice.vendorRecipients.includes(to) ? notice.path.vendor : notice.path.brand}\n\nSent by Setline for ${member.workspace.name}. Choose which emails you get: ${base}/settings/notifications` })),
        ...(notice.alertWebhookUrl ? [postAlert(notice.alertWebhookUrl, `${notice.subject}\n${notice.text}\n${base}${notice.path.brand}`)] : []),
      ]);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) console.error(`Setline: ${failed} of ${results.length} notifications could not be sent (${event.type}).`);
    } catch (error) {
      console.error("Setline: a notification could not be prepared.", error);
    }
  });
}

/** Posts a plain-text alert to the workspace's Slack or Teams incoming webhook. */
async function postAlert(url: string, text: string): Promise<void> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Alert webhook answered ${response.status}`);
}

export async function requestSignInLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const isDev = process.env.NODE_ENV !== "production";
  if (!emailConfigured() && !isDev) {
    return { error: "Email is not set up for this site yet, so sign-in links cannot be sent." };
  }
  try {
    const { email, token } = await createLoginToken(await getDb(), text(formData, "email"));
    const link = `${await baseUrl()}/auth/verify?token=${token}`;
    const sent = await sendEmail({
      to: email,
      subject: "Your Setline sign-in link",
      text: `Open this link to sign in to Setline. It works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
    return { message: `Check ${email} for a sign-in link. It expires in ${LOGIN_TOKEN_MINUTES} minutes.`, devLink: sent ? undefined : link };
  } catch (error) {
    return failure(error);
  }
}

export async function completeSignIn(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { sessionToken, expiresAt } = await consumeLoginToken(await getDb(), text(formData, "token"));
    (await cookies()).set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch (error) {
    return failure(error);
  }
  redirect("/programs");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await createWorkspace(await getDb(), user, {
      name: text(formData, "name"),
      timezone: text(formData, "timezone"),
      withSamples: formData.get("samples") === "on",
    });
  } catch (error) {
    return failure(error);
  }
  redirect("/programs");
}

const FILE_FIELDS = ["artwork", "specs", "quantities", "shipTo"] as const;

export async function createProgramAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const submitNow = text(formData, "intent") === "submit";
  let id: string;
  try {
    assertWritable(member);
    id = await createProgram(await getDb(), member, {
      name: text(formData, "name"),
      retailer: text(formData, "retailer"),
      displayType: text(formData, "displayType"),
      storeCount: text(formData, "storeCount"),
      inStoreDate: text(formData, "inStoreDate"),
      vendorId: text(formData, "vendorId"),
      leadTimes: stepInput(formData),
      files: FILE_FIELDS.map((kind) => ({ kind, url: text(formData, `file.${kind}`) })),
      submitNow,
    });
  } catch (error) {
    return failure(error);
  }
  if (submitNow) await announce(member, { type: "submittedToVendor", programId: id });
  redirect(`/programs/${id}`);
}

export async function completeMilestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  try {
    assertWritable(member);
    await completeNextMilestone(await getDb(), member, text(formData, "programId"), text(formData, "milestone"));
  } catch (error) {
    return failure(error);
  }
  if (text(formData, "milestone") === "submit") await announce(member, { type: "submittedToVendor", programId: text(formData, "programId") });
  refresh();
  return {};
}

function stepInput(formData: FormData): StepInput {
  const steps: StepInput = {};
  for (const step of STEPS) steps[step] = { days: text(formData, `days_${step}`), unit: text(formData, `unit_${step}`) };
  return steps;
}

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  try {
    await updateProfile(await getDb(), member, text(formData, "id"), { name: text(formData, "name"), steps: stepInput(formData) });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { message: "Saved. Every program using this profile has been recalculated." };
}

export async function createProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  try {
    await createProfile(await getDb(), member, {
      name: text(formData, "name"),
      vendorId: text(formData, "vendorId"),
      origin: text(formData, "origin"),
      process: text(formData, "process"),
      steps: stepInput(formData),
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { message: "Profile added." };
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  await deleteProfile(await getDb(), member, text(formData, "id"));
  refresh();
}

export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  try {
    const { email } = await inviteMember(await getDb(), member, {
      email: text(formData, "email"),
      role: text(formData, "role"),
      vendorId: text(formData, "vendorId"),
      retailer: text(formData, "retailer"),
    });
    let sent = false;
    if (emailConfigured()) {
      sent = await sendEmail({
        to: email,
        subject: `${member.workspace.name} invited you to Setline`,
        text: `You have been invited to ${member.workspace.name} on Setline.\n\nSign in with this email address to join:\n${await baseUrl()}/sign-in`,
      });
    }
    refresh();
    return { message: sent ? `Invitation sent to ${email}.` : `${email} is invited. Email is not set up, so ask them to sign in with that address.` };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const member = await requireMember();
  await revokeInvitation(await getDb(), member, text(formData, "id"));
  refresh();
}

/** For one-tap buttons with no message area: expected problems (a stale page, a role change) just reload the page. */
async function quietly(run: (member: Awaited<ReturnType<typeof requireMember>>) => Promise<unknown>): Promise<void> {
  const member = await requireMember();
  try {
    assertWritable(member);
    await run(member);
  } catch (error) {
    failure(error);
  }
  refresh();
}

/** Runs a change and reports the result to the form. */
async function attempt(run: (member: Awaited<ReturnType<typeof requireMember>>) => Promise<string | void>, options: { whenReadOnly?: boolean } = {}): Promise<FormState> {
  const member = await requireMember();
  try {
    // Every change stops when a trial has ended, except the few that are about the person, not the workspace's work.
    if (!options.whenReadOnly) assertWritable(member);
    const message = await run(member);
    refresh();
    return message ? { message } : {};
  } catch (error) {
    return failure(error);
  }
}

export async function createVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await createVendor(await getDb(), member, { name: text(formData, "name"), makes: text(formData, "makes"), origin: text(formData, "origin"), process: text(formData, "process") });
    return "Vendor added. Invite their contact so they can update status themselves.";
  });
}

export async function assignVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await assignVendor(await getDb(), member, text(formData, "programId"), text(formData, "vendorId"));
    return "Vendor saved. The key dates now use this vendor's lead times.";
  });
}

export async function setVendorStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await setVendorStatus(await getDb(), member, {
      programId: text(formData, "programId"),
      state: text(formData, "state"),
      note: text(formData, "note"),
      expectedStart: text(formData, "expectedStart"),
    });
    await announce(member, { type: "vendorStatus", programId: text(formData, "programId") });
    return "Status updated.";
  });
}

export async function completeVendorMilestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await completeVendorMilestone(await getDb(), member, text(formData, "programId"), text(formData, "milestone"));
  });
}

export async function submitProofAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const proofId = await submitProof(await getDb(), member, { programId: text(formData, "programId"), kind: text(formData, "kind"), url: text(formData, "url"), note: text(formData, "note") });
    await announce(member, { type: "proofSent", proofId });
    return "Sent for approval.";
  });
}

export async function decideProofAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await decideProof(await getDb(), member, { proofId: text(formData, "proofId"), decision: text(formData, "decision"), note: text(formData, "note") });
    await announce(member, { type: "proofDecided", proofId: text(formData, "proofId") });
  });
}

export async function addProofCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const rawX = text(formData, "pinX");
    const rawY = text(formData, "pinY");
    const pin = rawX && rawY ? { x: Number(rawX), y: Number(rawY) } : undefined;
    await addProofComment(await getDb(), member, text(formData, "proofId"), text(formData, "body"), pin);
  });
}

export async function submitSampleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await submitSamplePhoto(await getDb(), member, { programId: text(formData, "programId"), url: text(formData, "url"), note: text(formData, "note") });
    await announce(member, { type: "sampleSent", programId: text(formData, "programId") });
    return "Sent for approval.";
  });
}

export async function decideSampleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await decideSample(await getDb(), member, { programId: text(formData, "programId"), decision: text(formData, "decision"), note: text(formData, "note") });
    await announce(member, { type: "sampleDecided", programId: text(formData, "programId") });
  });
}

export async function createGuidelineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await createGuideline(await getDb(), member, {
      type: text(formData, "type"),
      title: text(formData, "title"),
      retailer: text(formData, "retailer"),
      vendorId: text(formData, "vendorId"),
      reviewBy: text(formData, "reviewBy"),
      label: text(formData, "label"),
      url: text(formData, "url"),
    });
    return "Guideline added.";
  });
}

export async function addGuidelineVersionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await addGuidelineVersion(await getDb(), member, { guidelineId: text(formData, "guidelineId"), label: text(formData, "label"), url: text(formData, "url") });
    return "New version added.";
  });
}

export async function deleteGuidelineAction(formData: FormData): Promise<void> {
  await quietly(async (member) => deleteGuideline(await getDb(), member, text(formData, "id")));
}

export async function addStoresAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const { added, skipped } = await addStores(await getDb(), member, text(formData, "programId"), text(formData, "stores"));
    return `${added} ${added === 1 ? "store" : "stores"} added${skipped ? `, ${skipped} already on the list` : ""}.`;
  });
}

export async function markStoreAction(formData: FormData): Promise<void> {
  await quietly(async (member) => markStore(await getDb(), member, text(formData, "storeId"), text(formData, "step")));
}

export async function markAllStoresAction(formData: FormData): Promise<void> {
  await quietly(async (member) => markAllStores(await getDb(), member, text(formData, "programId"), text(formData, "step")));
}

export async function resetStoreAction(formData: FormData): Promise<void> {
  await quietly(async (member) => resetStore(await getDb(), member, text(formData, "storeId")));
}

export async function removeStoreAction(formData: FormData): Promise<void> {
  await quietly(async (member) => removeStore(await getDb(), member, text(formData, "storeId")));
}

export async function moveInStoreDateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await moveInStoreDate(await getDb(), member, text(formData, "programId"), text(formData, "inStoreDate"));
    return "In-store date moved. Every key date has been counted back from the new date.";
  });
}

export async function addProgramFileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await addProgramFile(await getDb(), member, { programId: text(formData, "programId"), kind: text(formData, "kind"), url: text(formData, "url") });
    return "File added.";
  });
}

export async function removeProgramFileAction(formData: FormData): Promise<void> {
  await quietly(async (member) => removeProgramFile(await getDb(), member, text(formData, "fileId")));
}

export async function updateProgramDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await updateProgramDetails(await getDb(), member, text(formData, "programId"), {
      name: text(formData, "name"), retailer: text(formData, "retailer"), displayType: text(formData, "displayType"), storeCount: text(formData, "storeCount"),
    });
    return "Saved.";
  });
}

export async function updateProgramLeadTimesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await updateProgramLeadTimes(await getDb(), member, text(formData, "programId"), stepInput(formData));
    return "Lead times saved. Every key date has been counted back again.";
  });
}

export async function undoMilestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await undoMilestone(await getDb(), member, text(formData, "programId"), text(formData, "milestone"));
    return "Marked as not done.";
  });
}

export async function setMilestoneDateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await setMilestoneDate(await getDb(), member, text(formData, "programId"), text(formData, "milestone"), text(formData, "date"));
    return "Date corrected.";
  });
}

export async function logChangeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const changeId = await logChange(await getDb(), member, {
      programId: text(formData, "programId"), category: text(formData, "category"), summary: text(formData, "summary"),
      reopen: formData.getAll("reopen").filter((value): value is string => typeof value === "string"),
    });
    await announce(member, { type: "changeLogged", changeId });
    return "Change logged. The vendor will see it on their programs page.";
  });
}

export async function acknowledgeChangeAction(formData: FormData): Promise<void> {
  await quietly(async (member) => acknowledgeChange(await getDb(), member, text(formData, "changeId")));
}

export async function setStorePhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await setStorePhoto(await getDb(), member, text(formData, "storeId"), text(formData, "url"));
    return "Photo added. The store is marked installed.";
  });
}

export async function removeStorePhotoAction(formData: FormData): Promise<void> {
  await quietly(async (member) => removeStorePhoto(await getDb(), member, text(formData, "storeId")));
}

export async function retailerSignoffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await giveRetailerSignoff(await getDb(), member, text(formData, "programId"), text(formData, "note"));
    return "Sign-off recorded.";
  });
}

export async function withdrawRetailerSignoffAction(formData: FormData): Promise<void> {
  await quietly(async (member) => withdrawRetailerSignoff(await getDb(), member, text(formData, "programId")));
}

export async function saveNoticePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    await setNoticePreferences(await getDb(), member, formData.getAll("notice").filter((value): value is string => typeof value === "string"));
    return "Saved.";
  }, { whenReadOnly: true });
}

export async function setAlertWebhookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const url = formData.has("disconnect") ? "" : text(formData, "webhook");
    await setAlertWebhook(await getDb(), member, url);
    return url.trim() ? "Connected. Alerts will be posted there from now on." : "Disconnected.";
  });
}

export async function createCalendarLinkAction(): Promise<FormState> {
  const member = await requireMember();
  try {
    assertWritable(member);
    const token = await createCalendarToken(await getDb(), member);
    refresh();
    return { message: "Copy this address into your calendar app now. It is shown only once.", secret: `${await baseUrl()}/calendar/${token}.ics` };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCalendarLinkAction(): Promise<void> {
  await quietly(async (member) => removeCalendarToken(await getDb(), member));
}

export async function importProgramsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return attempt(async (member) => {
    const { created } = await importPrograms(await getDb(), member, text(formData, "rows"));
    return `Imported ${created} ${created === 1 ? "program" : "programs"} as plans.`;
  });
}

/** Sends the person to Stripe Checkout for a new subscription. Works even on a read-only, trial-ended workspace: this is how it stops being read-only. */
export async function beginCheckoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const base = await baseUrl();
  let url: string;
  try {
    url = await beginCheckout(await getDb(), member, {
      plan: text(formData, "plan"),
      interval: text(formData, "interval"),
      successUrl: `${base}/settings/billing?checkout=success`,
      cancelUrl: `${base}/settings/billing?checkout=canceled`,
    });
  } catch (error) {
    return failure(error);
  }
  redirect(url);
}

/** Sends the person to the Stripe Billing Portal to update their card, change plan, or cancel. */
export async function beginBillingPortalAction(): Promise<void> {
  const member = await requireMember();
  const base = await baseUrl();
  const url = await beginBillingPortal(await getDb(), member, `${base}/settings/billing`);
  redirect(url);
}

/** Operator controls: manual overrides for cases card checkout does not cover (Enterprise, comps, fixes). The services check the operator list again. */
export async function operatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const workspaceId = text(formData, "workspaceId");
  try {
    const intent = text(formData, "intent");
    if (intent === "plan") await setWorkspacePlan(db, user.email, workspaceId, text(formData, "plan"));
    else if (intent === "extend") await extendTrial(db, user.email, workspaceId);
    else if (intent === "founding") await setFounding(db, user.email, workspaceId, text(formData, "founding") === "on");
    else throw new InputError("Unknown action.");
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { message: "Saved." };
}
