"use client";

import { useActionState } from "react";
import { createCalendarLinkAction, importProgramsAction, saveNoticePreferencesAction, setAlertWebhookAction } from "@/app/actions";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function NoticePreferencesForm({ choices }: { choices: { type: string; label: string; detail: string; on: boolean }[] }) {
  const [state, action] = useActionState(saveNoticePreferencesAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col">
        <legend className="sr-only">Emails to receive</legend>
        {choices.map((choice) => (
          <label key={choice.type} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-line py-3 last:border-b-0">
            <input type="checkbox" name="notice" value={choice.type} defaultChecked={choice.on} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1C1A17]" />
            <span>
              <span className="block text-sm font-semibold">{choice.label}</span>
              <span className="block text-[13px] text-muted">{choice.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton className="self-start">Save</SubmitButton>
    </form>
  );
}

export function AlertWebhookForm({ connected }: { connected: boolean }) {
  const [state, action] = useActionState(setAlertWebhookAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={LABEL}>
        {connected ? "Replace the webhook address" : "Incoming webhook address"}
        <input name="webhook" type="url" required={!connected} placeholder="https://hooks.slack.com/services/…" autoComplete="off" className={FIELD} />
      </label>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="outline">{connected ? "Save" : "Connect"}</SubmitButton>
        {connected && <button type="submit" name="disconnect" value="1" formNoValidate className="h-12 rounded-xl border-[1.5px] border-control px-5 text-sm font-semibold text-muted">Disconnect</button>}
      </div>
    </form>
  );
}

export function CalendarLinkForm({ exists }: { exists: boolean }) {
  const [state, action] = useActionState(createCalendarLinkAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      {state.secret && (
        <label className={LABEL}>
          Calendar address
          <input readOnly value={state.secret} onFocus={(e) => e.currentTarget.select()} className={`${FIELD} font-mono text-[13px]`} />
        </label>
      )}
      <SubmitButton variant="outline" className="self-start">{exists || state.secret ? "Replace the calendar address" : "Create a calendar address"}</SubmitButton>
    </form>
  );
}

export function ImportProgramsForm() {
  const [state, action] = useActionState(importProgramsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className={LABEL}>
        Rows from your spreadsheet
        <textarea name="rows" required rows={5} placeholder={"Spring Endcap, Northline Beauty, Endcap, 2027-03-15, Harbor Display Co., 420"} className={`${FIELD} h-auto py-2.5 font-mono text-[13px]`} />
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Import as plans</SubmitButton>
    </form>
  );
}
