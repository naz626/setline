"use client";

import { useActionState } from "react";
import { createProfileAction, saveProfileAction } from "@/app/actions";
import { PROCESSES } from "@/lib/options";
import { STEPS, STEP_LABELS } from "@/lib/timeline";
import type { StepDurations } from "@/lib/timeline";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

function StepFields({ steps, required }: { steps: Partial<StepDurations>; required: boolean }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-6 gap-y-4">
      {STEPS.map((step) => (
        <fieldset key={step} className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">{STEP_LABELS[step]}</legend>
          <div className="flex gap-2">
            <input name={`days_${step}`} type="number" min={0} max={365} inputMode="numeric" required={required}
              defaultValue={steps[step]?.days ?? ""} placeholder="Not set" aria-label={`${STEP_LABELS[step]} days`}
              className={`${FIELD.replace("w-full", "w-24")} shrink-0`} />
            <select name={`unit_${step}`} defaultValue={steps[step]?.unit ?? (step === "transitAndSet" ? "calendar" : "working")}
              aria-label={`${STEP_LABELS[step]} day type`} className={FIELD}>
              <option value="working">working days</option>
              <option value="calendar">calendar days</option>
            </select>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function ProfileForm({ profile, appliesTo }: {
  profile: { id: string; name: string; isDefault: boolean; steps: Partial<StepDurations> };
  appliesTo: string;
}) {
  const [state, action] = useActionState(saveProfileAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={profile.id} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {profile.isDefault ? (
          <h3 className="font-display text-xl font-bold">{profile.name}</h3>
        ) : (
          <label className={`${LABEL} flex-[0_1_320px]`}>
            Profile name
            <input name="name" required maxLength={80} defaultValue={profile.name} className={FIELD} />
          </label>
        )}
        <p className="pb-3 text-sm text-muted">Applies to: <strong className="font-semibold text-ink">{appliesTo}</strong></p>
      </div>
      <StepFields steps={profile.steps} required={profile.isDefault} />
      {!profile.isDefault && <p className="text-[13px] text-muted">Leave a step empty to use the number from a broader profile.</p>}
      <FormMessage state={state} />
      <SubmitButton className="self-start">Save changes</SubmitButton>
    </form>
  );
}

export function NewProfileForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProfileAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-5">
        <label className={`${LABEL} flex-[1_1_240px]`}>
          Profile name
          <input name="name" required maxLength={80} placeholder="For example: Overseas by air" className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_180px]`}>
          Vendor
          <select name="vendorId" defaultValue="" className={FIELD}>
            <option value="">Any vendor</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <label className={`${LABEL} flex-[1_1_160px]`}>
          Made
          <select name="origin" defaultValue="" className={FIELD}>
            <option value="">Anywhere</option>
            <option value="domestic">Domestically</option>
            <option value="overseas">Overseas</option>
          </select>
        </label>
        <label className={`${LABEL} flex-[1_1_160px]`}>
          Process
          <select name="process" defaultValue="" className={FIELD}>
            <option value="">Any process</option>
            {PROCESSES.map((process) => <option key={process.id} value={process.id}>{process.label}</option>)}
          </select>
        </label>
      </div>
      <StepFields steps={{}} required={false} />
      <p className="text-[13px] text-muted">Fill in only the steps this situation changes. The rest come from broader profiles.</p>
      <FormMessage state={state} />
      <SubmitButton variant="accent" className="self-start">Add profile</SubmitButton>
    </form>
  );
}
