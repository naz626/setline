"use client";

import { useActionState } from "react";
import { decideSampleAction, submitSampleAction } from "@/app/actions";
import { FileField } from "./FileField";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function SubmitSampleForm({ programId }: { programId: string }) {
  const [state, action] = useActionState(submitSampleAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <FileField label="Photo of the sample" accept="image/*" required />
      <label className={LABEL}>
        <span>Note <span className="font-normal text-muted">(optional)</span></span>
        <input name="note" maxLength={1000} className={FIELD} />
      </label>
      <FormMessage state={state} />
      <SubmitButton className="self-start">Send for approval</SubmitButton>
    </form>
  );
}

export function DecideSampleForm({ programId }: { programId: string }) {
  const [state, action] = useActionState(decideSampleAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <label className={LABEL}>
        <span>Note <span className="font-normal text-muted">(needed when you request changes)</span></span>
        <textarea name="note" maxLength={1000} rows={3} className={`${FIELD} h-auto py-2.5`} />
      </label>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="decision" value="approved" className="h-12 flex-[1_1_160px] rounded-xl bg-ink px-5 text-sm font-semibold text-white">Approve</button>
        <button type="submit" name="decision" value="changesRequested" className="h-12 flex-[1_1_160px] rounded-xl border-[1.5px] border-ink px-5 text-sm font-semibold">Request changes</button>
      </div>
    </form>
  );
}
