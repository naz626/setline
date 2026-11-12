"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, LOGIN_TOKEN_MINUTES, consumeLoginToken, createLoginToken, deleteSession } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { SESSION_COOKIE, requireMember, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { emailConfigured, sendEmail } from "@/lib/email";
import { InputError } from "@/lib/services/errors";
import { createProfile, deleteProfile, updateProfile } from "@/lib/services/leadTimes";
import type { StepInput } from "@/lib/services/leadTimes";
import { completeNextMilestone, createProgram } from "@/lib/services/programs";
import { inviteMember, revokeInvitation } from "@/lib/services/team";
import { createWorkspace } from "@/lib/services/workspace";
import { STEPS } from "@/lib/timeline";

export interface FormState {
  error?: string;
  message?: string;
  /** Development only: the sign-in link, shown on screen when email is not set up. */
  devLink?: string;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Turns expected problems into a message for the form. Anything unexpected is rethrown. */
function failure(error: unknown): FormState {
  if (error instanceof InputError || error instanceof AuthError || error instanceof ForbiddenError) {
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

export async function createProgramAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  let id: string;
  try {
    id = await createProgram(await getDb(), member, {
      name: text(formData, "name"),
      retailer: text(formData, "retailer"),
      displayType: text(formData, "displayType"),
      storeCount: text(formData, "storeCount"),
      inStoreDate: text(formData, "inStoreDate"),
      vendorId: text(formData, "vendorId"),
    });
  } catch (error) {
    return failure(error);
  }
  redirect(`/programs/${id}`);
}

export async function completeMilestoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  try {
    await completeNextMilestone(await getDb(), member, text(formData, "programId"), text(formData, "milestone"));
  } catch (error) {
    return failure(error);
  }
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
