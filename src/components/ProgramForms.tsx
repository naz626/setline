"use client";

import { useActionState } from "react";
import { addProgramFileAction, retailerSignoffAction, completeMilestoneAction, logChangeAction, moveInStoreDateAction, setMilestoneDateAction, undoMilestoneAction, updateProgramDetailsAction, updateProgramLeadTimesAction } from "@/app/actions";
import { DISPLAY_TYPES } from "@/lib/options";
import { FileField } from "./FileField";
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
        <div className="flex-[2_1_320px]"><FileField label="The file" required /></div>
        <SubmitButton variant="outline">Add file</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Corrects the day a key date was done, and (for the most recent one) takes it back. */
export function EditMilestoneForm({ programId, milestone, label, doneOn, today, canUndo }: { programId: string; milestone: string; label: string; doneOn: string; today: string; canUndo: boolean }) {
  const [dateState, dateAction] = useActionState(setMilestoneDateAction, {});
  const [undoState, undoAction] = useActionState(undoMilestoneAction, {});
  return (
    <div className="flex flex-col gap-3 text-left font-normal">
      <form action={dateAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="milestone" value={milestone} />
        <label className={`${LABEL} flex-[0_1_200px]`}>
          <span>Done on<span className="sr-only">: {label}</span></span>
          <input name="date" type="date" required max={today} defaultValue={doneOn} className={FIELD} />
        </label>
        <SubmitButton variant="outline">Save date</SubmitButton>
      </form>
      <FormMessage state={dateState} />
      {canUndo ? (
        <form action={undoAction} className="flex flex-col gap-2">
          <input type="hidden" name="programId" value={programId} />
          <input type="hidden" name="milestone" value={milestone} />
          <SubmitButton variant="outline" className="self-start">Mark as not done<span className="sr-only">: {label}</span></SubmitButton>
          <FormMessage state={undoState} />
        </form>
      ) : <p className="text-[13px] text-muted">To mark this as not done, first undo the dates completed after it.</p>}
    </div>
  );
}

export function EditDetailsForm({ program }: { program: { id: string; name: string; retailer: string; displayType: string; storeCount: number | null } }) {
  const [state, action] = useActionState(updateProgramDetailsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="programId" value={program.id} />
      <div className="flex flex-wrap gap-4">
        <label className={`${LABEL} flex-[2_1_260px]`}>
          Program name
          <input name="name" required maxLength={120} defaultValue={program.name} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_200px]`}>
          Retailer
          <input name="retailer" maxLength={120} defaultValue={program.retailer} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_170px]`}>
          Display type
          <select name="displayType" defaultValue={program.displayType} className={FIELD}>
            {DISPLAY_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={`${LABEL} flex-[1_1_130px]`}>
          Store count
          <input name="storeCount" type="number" min={0} max={100000} inputMode="numeric" defaultValue={program.storeCount ?? ""} className={FIELD} />
        </label>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Save details</SubmitButton>
    </form>
  );
}

/** Any in-store date from today on. Every key date is counted back again from it. */
export function ChangeInStoreDateForm({ programId, current, today }: { programId: string; current: string; today: string }) {
  const [state, action] = useActionState(moveInStoreDateAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[0_1_220px]`}>
          In-store date
          <input name="inStoreDate" type="date" required min={today} defaultValue={current} className={FIELD} />
        </label>
        <SubmitButton variant="outline">Change the date</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ProgramLeadTimesForm({ programId, steps }: { programId: string; steps: { id: string; label: string; days: number; unit: string }[] }) {
  const [state, action] = useActionState(updateProgramLeadTimesAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      {steps.map((step) => (
        <label key={step.id} className="flex items-center justify-between gap-3 text-sm font-semibold">
          {step.label}
          <span className="flex items-center gap-2 font-normal">
            <input name={`days_${step.id}`} type="number" required min={0} max={365} inputMode="numeric" defaultValue={step.days} className={FIELD.replace("w-full", "w-20")} />
            <input type="hidden" name={`unit_${step.id}`} value={step.unit} />
            <span className="w-24 text-[13px] text-muted">{step.unit} days</span>
          </span>
        </label>
      ))}
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Save lead times</SubmitButton>
    </form>
  );
}

const CHANGE_KINDS = [["artwork", "Artwork"], ["structure", "Structure"], ["quantities", "Quantities"], ["stores", "Store list"], ["dates", "Dates"], ["other", "Other"]] as const;

export function LogChangeForm({ programId, approvals }: { programId: string; approvals: { id: string; label: string }[] }) {
  const [state, action] = useActionState(logChangeAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap gap-4">
        <label className={`${LABEL} flex-[0_1_200px]`}>
          What kind of change
          <select name="category" className={FIELD}>
            {CHANGE_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className={`${LABEL} flex-[2_1_320px]`}>
          What changed
          <textarea name="summary" required maxLength={1000} rows={2} placeholder="For example: retailer moved the price callout to the header" className={`${FIELD} h-auto py-2.5`} />
        </label>
      </div>
      {approvals.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Does anything need to be approved again?</legend>
          <p className="text-[13px] text-muted">Ticking one reopens that approval and takes its key date back, so the timeline shows the real effect.</p>
          <div className="mt-1 flex flex-wrap gap-x-6">
            {approvals.map((approval) => (
              <label key={approval.id} className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
                <input type="checkbox" name="reopen" value={approval.id} className="h-5 w-5 accent-[#1C1A17]" />
                {approval.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormMessage state={state} />
      <SubmitButton className="self-start">Log the change</SubmitButton>
    </form>
  );
}

export function RetailerSignoffForm({ programId, own }: { programId: string; own: boolean }) {
  const [state, action] = useActionState(retailerSignoffAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <label className={LABEL}>
        <span>Note <span className="font-normal text-muted">(optional)</span></span>
        <input name="note" maxLength={500} placeholder={own ? "For example: approved for all regions" : "For example: approved by email on Nov 12"} className={FIELD} />
      </label>
      <FormMessage state={state} />
      <SubmitButton className="self-start">{own ? "Sign off on this program" : "Record the retailer's sign-off"}</SubmitButton>
    </form>
  );
}
