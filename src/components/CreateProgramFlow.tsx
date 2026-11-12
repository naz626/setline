"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { createProgramAction } from "@/app/actions";
import type { PlannerVendor } from "@/lib/leadTimeScope";
import { DISPLAY_TYPES } from "@/lib/options";
import { MILESTONES, MILESTONE_LABELS, STEPS, STEP_LABELS, formatLong, formatShort, resolveLeadTimes, scheduleBackward } from "@/lib/timeline";
import type { LeadTimeProfile, StepKey } from "@/lib/timeline";
import { FileField } from "./FileField";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

const STAGES = ["Basics", "Vendor", "Files", "Dates", "Submit"] as const;
const FILES = [
  { kind: "artwork", label: "Artwork" },
  { kind: "specs", label: "Specs" },
  { kind: "quantities", label: "Quantities" },
  { kind: "shipTo", label: "Ship-to list" },
] as const;
const NAV = "h-12 rounded-xl px-5 text-sm font-semibold";

export function CreateProgramFlow({ vendors, profiles, today }: { vendors: PlannerVendor[]; profiles: LeadTimeProfile[]; today: string }) {
  const [state, action] = useActionState(createProgramAction, {});
  const [stage, setStage] = useState(0);
  const [name, setName] = useState("");
  const [retailer, setRetailer] = useState("");
  const [displayType, setDisplayType] = useState<string>("Endcap");
  const [vendorId, setVendorId] = useState("");
  const [inStore, setInStore] = useState("");
  const [changed, setChanged] = useState<Partial<Record<StepKey, number>>>({});
  const [filled, setFilled] = useState<string[]>([]);
  const fileCount = filled.length;
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const vendor = vendors.find((v) => v.id === vendorId);
  const resolved = useMemo(() => {
    const context = { vendorId: vendor?.id, origin: vendor?.origin, process: vendor?.process, displayType };
    const base = resolveLeadTimes(profiles, context);
    const overrides = Object.fromEntries(Object.entries(changed).map(([step, days]) => [step, { days, unit: base[step as StepKey].unit }]));
    return resolveLeadTimes(profiles, context, overrides);
  }, [profiles, vendor, displayType, changed]);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(inStore);
  const schedule = useMemo(() => (validDate ? scheduleBackward(inStore, resolved) : undefined), [validDate, inStore, resolved]);
  const startsInPast = schedule ? schedule.submit < today : false;

  function go(to: number) {
    // Moving forward checks the fields on the step being left, using the browser's own messages.
    if (to > stage) {
      const fields = form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-panel="${stage}"] input, [data-panel="${stage}"] select`) ?? [];
      for (const field of fields) if (!field.reportValidity()) return;
    }
    setStage(to);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function setDays(step: StepKey, value: string) {
    const days = Number.parseInt(value, 10);
    if (Number.isNaN(days) || days < 0 || days > 365) return;
    setChanged((current) => ({ ...current, [step]: days }));
  }

  const panel = (index: number) => ({
    "data-panel": index,
    hidden: stage !== index,
    className: "flex flex-col gap-5 [&[hidden]]:hidden",
  });

  return (
    <form ref={form} action={action} className="flex flex-col gap-6 rounded-[18px] border border-line bg-surface p-6 sm:p-7">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STAGES.map((label, i) => (
          <li key={label} className="flex-[1_1_90px]">
            <button type="button" onClick={() => go(i)} disabled={i > stage} aria-current={i === stage ? "step" : undefined}
              className={`flex h-12 w-full items-center gap-2 rounded-xl border-[1.5px] px-3 text-left text-sm font-semibold ${i === stage ? "border-ink bg-ink text-white" : i < stage ? "border-ink text-ink" : "border-line text-muted"}`}>
              <span aria-hidden="true" className="font-display">{i < stage ? "✓" : i + 1}</span>
              {label}
              {i < stage && <span className="sr-only"> (done, go back)</span>}
            </button>
          </li>
        ))}
      </ol>

      <h2 ref={heading} tabIndex={-1} className="font-display text-2xl font-bold tracking-tight outline-none">
        {["What are you making?", "Who is making it?", "What does the vendor need?", "When does it have to be in store?", "Check it over"][stage]}
      </h2>

      <fieldset {...panel(0)}>
        <legend className="sr-only">Basics</legend>
        <label className={LABEL}>
          Program name
          <input name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>
        <div className="flex flex-wrap gap-5">
          <label className={`${LABEL} flex-[1_1_240px]`}>
            <span>Retailer <span className="font-normal text-muted">(optional)</span></span>
            <input name="retailer" maxLength={120} value={retailer} onChange={(e) => setRetailer(e.target.value)} className={FIELD} />
          </label>
          <label className={`${LABEL} flex-[1_1_200px]`}>
            Display type
            <select name="displayType" required value={displayType} onChange={(e) => setDisplayType(e.target.value)} className={FIELD}>
              {DISPLAY_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className={`${LABEL} flex-[1_1_160px]`}>
            <span>Store count <span className="font-normal text-muted">(optional)</span></span>
            <input name="storeCount" type="number" min={0} max={100000} inputMode="numeric" className={FIELD} />
          </label>
        </div>
        <p className="text-[13px] text-muted">Store guidelines for the retailer you name are attached automatically.</p>
      </fieldset>

      <fieldset {...panel(1)}>
        <legend className="sr-only">Vendor</legend>
        <label className={LABEL}>
          Vendor
          <select name="vendorId" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={FIELD}>
            <option value="">Decide later</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm leading-relaxed">
          {vendor
            ? `${vendor.name} makes displays ${vendor.origin === "overseas" ? "overseas" : "domestically"}. The key dates will use the lead times that fit them.`
            : "With no vendor, the key dates use your workspace default lead times. You can choose a vendor later and the dates will update."}
        </p>
        {vendors.length === 0 && <p className="text-[13px] text-muted">You have no vendors yet. Add them on the Vendors page after saving this program.</p>}
      </fieldset>

      <fieldset {...panel(2)}>
        <legend className="sr-only">Files</legend>
        <p className="text-sm text-muted">Add each file you have. All of these are optional and you can add them later.</p>
        {FILES.map((file) => (
          <FileField key={file.kind} name={`file.${file.kind}`} label={file.label}
            onChange={(filled) => setFilled((current) => (filled ? [...new Set([...current, file.kind])] : current.filter((kind) => kind !== file.kind)))} />
        ))}
      </fieldset>

      <fieldset {...panel(3)}>
        <legend className="sr-only">Dates</legend>
        <div className="flex flex-wrap items-end gap-5 rounded-[14px] bg-canvas p-5">
          <label className={`${LABEL} flex-[0_1_240px]`}>
            In-store date
            <input name="inStoreDate" type="date" required min={today} value={inStore} onChange={(e) => setInStore(e.target.value)}
              className="h-14 w-full rounded-xl border-2 border-ink bg-surface px-3 font-display text-lg font-bold" />
          </label>
          <p className="flex-[1_1_280px] pb-1.5 text-sm leading-relaxed">Every key date is counted back from here.</p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[1_1_340px]">
            <h3 className="font-display text-lg font-bold">Lead times for this program</h3>
            <p className="mt-1 text-[13px] text-muted">Change any number that is different for this one program.</p>
            <ul className="mt-2">
              {STEPS.map((step) => {
                const lead = resolved[step];
                const isChanged = changed[step] !== undefined;
                return (
                  <li key={step} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
                    <label htmlFor={`days_${step}`} className="flex-[1_1_150px] text-sm font-semibold">{STEP_LABELS[step]}</label>
                    <span className="flex items-center gap-2">
                      <input id={`days_${step}`} type="number" min={0} max={365} inputMode="numeric" value={lead.days} onChange={(e) => setDays(step, e.target.value)} className={FIELD.replace("w-full", "w-20")} />
                      <span className="w-24 text-[13px] text-muted">{lead.unit} days</span>
                    </span>
                    <span className="w-full text-[12px] text-muted">{isChanged ? "Changed for this program" : lead.source.kind === "profile" ? `From ${lead.source.profileName}` : ""}</span>
                    {isChanged && (
                      <>
                        <input type="hidden" name={`days_${step}`} value={lead.days} />
                        <input type="hidden" name={`unit_${step}`} value={lead.unit} />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {Object.keys(changed).length > 0 && (
              <button type="button" onClick={() => setChanged({})} className="mt-3 h-11 rounded-[10px] border-[1.5px] border-ink px-4 text-[13px] font-semibold">Reset my changes</button>
            )}
          </div>

          <div className="flex-[1_1_300px] rounded-[18px] bg-ink px-6 py-5 text-white" aria-live="polite">
            <h3 className="font-display text-lg font-bold">Key dates</h3>
            {schedule ? (
              <ol className="mt-2">
                {MILESTONES.map((key) => (
                  <li key={key} className="flex items-baseline justify-between gap-3 border-b border-white/25 py-2.5 last:border-b-0">
                    <span className="text-sm">{MILESTONE_LABELS[key]}</span>
                    <span className="text-right text-sm font-semibold">{formatShort(schedule[key])}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-sm">Pick the in-store date to see every key date.</p>}
          </div>
        </div>
        {startsInPast && schedule && (
          <p className="rounded-[14px] bg-[#FCEBC7] px-4 py-3 text-sm font-medium text-[#7A4B00]">
            To hit this date you would have needed to submit by {formatShort(schedule.submit)}, which has passed. You can still create it; it will show as behind until the date or lead times change.
          </p>
        )}
      </fieldset>

      <fieldset {...panel(4)}>
        <legend className="sr-only">Submit</legend>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            ["Program", name || "Not named yet"],
            ["Retailer", retailer || "None"],
            ["Display type", displayType],
            ["Vendor", vendor?.name ?? "Decide later"],
            ["Files", fileCount === 0 ? "None yet" : `${fileCount} linked`],
            ["In store", validDate ? formatLong(inStore) : "Not set"],
            ["Submit to vendor by", schedule ? formatLong(schedule.submit) : "Not set"],
            ["Lead times", Object.keys(changed).length === 0 ? "From your profiles" : `${Object.keys(changed).length} changed for this program`],
          ].map(([term, value]) => (
            <div key={term} className="border-b border-line pb-2.5">
              <dt className="text-[13px] text-muted">{term}</dt>
              <dd className="text-[15px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <FormMessage state={state} />
        <div className="flex flex-wrap gap-3">
          {vendor && (
            <SubmitButton variant="accent" name="intent" value="submit">Submit to {vendor.name}</SubmitButton>
          )}
          <SubmitButton variant={vendor ? "outline" : "accent"} name="intent" value="plan">Save as a plan</SubmitButton>
        </div>
        <p className="text-[13px] text-muted">
          {vendor ? `Submitting marks “Submit to vendor” done today and lets ${vendor.name}’s contacts see the program. A plan stays with your team until you submit it.` : "A plan stays with your team. Choose a vendor and submit it when you are ready."}
        </p>
      </fieldset>

      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-5">
        <button type="button" onClick={() => go(stage - 1)} disabled={stage === 0} className={`${NAV} border-[1.5px] border-ink disabled:border-line disabled:text-muted`}>Back</button>
        {stage < STAGES.length - 1 && <button type="button" onClick={() => go(stage + 1)} className={`${NAV} bg-ink text-white`}>Next: {STAGES[stage + 1]}</button>}
      </div>
    </form>
  );
}
