"use client";

import { useActionState } from "react";
import { completeMilestoneAction, createProgramAction } from "@/app/actions";
import { DISPLAY_TYPES } from "@/lib/options";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function NewProgramForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProgramAction, {});
  return (
    <form action={action} className="flex flex-col gap-6 rounded-[18px] border border-line bg-surface p-7">
      <label className={LABEL}>
        Program name
        <input name="name" required maxLength={120} className={FIELD} />
      </label>
      <div className="flex flex-wrap gap-5">
        <label className={`${LABEL} flex-[1_1_280px]`}>
          Retailer
          <input name="retailer" maxLength={120} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_160px]`}>
          <span>Store count <span className="font-normal text-muted">(optional)</span></span>
          <input name="storeCount" type="number" min={0} inputMode="numeric" className={FIELD} />
        </label>
      </div>
      <div className="flex flex-wrap gap-5">
        <label className={`${LABEL} flex-[1_1_220px]`}>
          Display type
          <select name="displayType" required defaultValue="Endcap" className={FIELD}>
            {DISPLAY_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={`${LABEL} flex-[1_1_220px]`}>
          <span>Vendor <span className="font-normal text-muted">(optional)</span></span>
          <select name="vendorId" defaultValue="" className={FIELD}>
            <option value="">Decide later</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-5 rounded-[14px] bg-canvas p-5">
        <label className={`${LABEL} flex-[0_1_240px]`}>
          In-store date
          <input name="inStoreDate" type="date" required className="h-14 w-full rounded-xl border-2 border-ink bg-surface px-3 font-display text-lg font-bold" />
        </label>
        <p className="flex-[1_1_300px] pb-1.5 text-sm leading-relaxed">
          Every key date is counted back from here, using the lead times for the vendor you pick.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="accent" className="self-end">Create program</SubmitButton>
    </form>
  );
}

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
