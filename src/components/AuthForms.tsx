"use client";

import { useActionState, useSyncExternalStore } from "react";
import { completeSignIn, createWorkspaceAction, requestSignInLink } from "@/app/actions";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function SignInForm() {
  const [state, action] = useActionState(requestSignInLink, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={LABEL}>
        Work email
        <input name="email" type="email" required autoComplete="email" placeholder="name@company.com" className={FIELD} />
      </label>
      <SubmitButton variant="accent">Email me a sign-in link</SubmitButton>
      <FormMessage state={state} />
      {state.devLink && (
        <p className="rounded-[10px] border border-dashed border-control px-3.5 py-3 text-sm">
          Email is not set up in this development copy, so here is the link:{" "}
          <a href={state.devLink} className="font-semibold break-all underline">Open sign-in link</a>
        </p>
      )}
    </form>
  );
}

export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState(completeSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <SubmitButton variant="accent">Sign in to Setline</SubmitButton>
      <FormMessage state={state} />
      {state.error && <a href="/sign-in" className="py-3 text-sm font-semibold underline">Request a new link</a>}
    </form>
  );
}

const noop = () => () => {};

export function WelcomeForm() {
  const [state, action] = useActionState(createWorkspaceAction, {});
  // The browser's time zone decides when "today" turns over for deadlines.
  const timezone = useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "America/New_York");
  return (
    <form action={action} className="flex flex-col gap-5">
      <label className={LABEL}>
        Brand or team name
        <input name="name" required maxLength={80} placeholder="Your brand" className={FIELD} />
      </label>
      <input type="hidden" name="timezone" value={timezone} />
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="samples" defaultChecked className="h-[22px] w-[22px] accent-ink" />
        Start with sample programs so I can look around
      </label>
      <SubmitButton variant="accent">Create my workspace</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
