"use client";

import { useActionState } from "react";
import { addProofCommentAction, decideProofAction, submitProofAction } from "@/app/actions";
import { FileField } from "./FileField";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function SubmitProofForm({ programId, kinds }: { programId: string; kinds: { id: string; label: string }[] }) {
  const [state, action] = useActionState(submitProofAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_170px]`}>
          Send for approval
          <select name="kind" className={FIELD}>
            {kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
        </label>
        <div className="flex-[2_1_320px]"><FileField label="The file" required /></div>
      </div>
      <label className={LABEL}>
        <span>Note <span className="font-normal text-muted">(optional)</span></span>
        <input name="note" maxLength={1000} className={FIELD} />
      </label>
      <FormMessage state={state} />
      <SubmitButton className="self-start">Send for approval</SubmitButton>
    </form>
  );
}

export function DecideProofForm({ proofId }: { proofId: string }) {
  const [state, action] = useActionState(decideProofAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="proofId" value={proofId} />
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

export function CommentForm({ proofId }: { proofId: string }) {
  const [state, action] = useActionState(addProofCommentAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="proofId" value={proofId} />
      <label className={LABEL}>
        Add a comment
        <textarea name="body" required maxLength={2000} rows={3} className={`${FIELD} h-auto py-2.5`} />
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Post comment</SubmitButton>
    </form>
  );
}
