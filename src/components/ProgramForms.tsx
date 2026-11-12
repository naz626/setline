"use client";

import { useActionState } from "react";
import { addProgramFileAction, completeMilestoneAction, moveInStoreDateAction } from "@/app/actions";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

const FILE_KINDS = [["artwork", "Artwork"], ["specs", "Specs"], ["quantities", "Quantities"], ["shipTo", "Ship-to list"], ["other", "Other file"]] as const;

export function CompleteMilestoneForm({ programId, milestone, label }: { programId: string; milestone: string; label: string }) {
  const [state, action] = useActionState(completeMilestoneAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="milestone" value={milestone} />
      <SubmitButton className="h-11 px-4 text-[13px]">Mark done today<span className="sr-only">: {label}</span></SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** One of the two answers to a late program: accept the projected date. */
export function MoveInStoreDateForm({ programId, date, label }: { programId: string; date: string; label: string }) {
  const [state, action] = useActionState(moveInStoreDateAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="inStoreDate" value={date} />
      <SubmitButton className="self-start">Move in-store date to {label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AddFileForm({ programId }: { programId: string }) {
  const [state, action] = useActionState(addProgramFileAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_150px]`}>
          Kind of file
          <select name="kind" className={FIELD}>
            {FILE_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className={`${LABEL} flex-[2_1_240px]`}>
          Link to the file
          <input name="url" type="url" required placeholder="https://" className={FIELD} />
        </label>
        <SubmitButton variant="outline">Add file</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
