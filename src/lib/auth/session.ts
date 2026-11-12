import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import type { UserRow } from "@/lib/db/schema";
import { findMember } from "@/lib/services/member";
import type { Member } from "@/lib/services/member";
import { getSessionUser } from "./core";

export const SESSION_COOKIE = "setline_session";

/** The signed-in user for this request, or undefined. Reads the session cookie, so call it inside a Suspense boundary. */
export const getCurrentUser = cache(async (): Promise<UserRow | undefined> => {
  // Session checks compare against the current time, so this always runs at request time.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return getSessionUser(await getDb(), token);
});

export const getCurrentMember = cache(async (): Promise<Member | undefined> => {
  const user = await getCurrentUser();
  if (!user) return undefined;
  return findMember(await getDb(), user);
});

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Use at the top of every signed-in page and action. Sends people to sign in, or to set up a workspace. */
export async function requireMember(): Promise<Member> {
  await requireUser();
  const member = await getCurrentMember();
  if (!member) redirect("/welcome");
  return member;
}
