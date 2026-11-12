"use client";

import { useActionState, useState } from "react";
import { assignVendorAction, completeVendorMilestoneAction, createVendorAction, inviteAction, setVendorStatusAction } from "@/app/actions";
import { PROCESSES } from "@/lib/options";
import { VENDOR_STYLES } from "@/lib/status";
import type { VendorState } from "@/lib/timeline";
import { StatusIcon } from "./StatusPill";
import { FIELD, FormMessage, LABEL, SubmitButton } from "./forms";

export function NewVendorForm() {
  const [state, action] = useActionState(createVendorAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[2_1_220px]`}>
          Vendor name
          <input name="name" required maxLength={120} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[2_1_220px]`}>
          <span>What they make <span className="font-normal text-muted">(optional)</span></span>
          <input name="makes" maxLength={200} className={FIELD} />
        </label>
        <label className={`${LABEL} flex-[1_1_150px]`}>
          Made
          <select name="origin" defaultValue="domestic" className={FIELD}>
            <option value="domestic">Domestic</option>
            <option value="overseas">Overseas</option>
          </select>
        </label>
        <label className={`${LABEL} flex-[1_1_170px]`}>
          Process
          <select name="process" defaultValue={PROCESSES[0].id} className={FIELD}>
            {PROCESSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <SubmitButton variant="accent">Add vendor</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function VendorContactForm({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const [state, action] = useActionState(inviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="role" value="vendorGuest" />
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_240px]`}>
          <span>Invite a contact <span className="sr-only">at {vendorName}</span></span>
          <input name="email" type="email" required placeholder="name@vendor.com" className={FIELD} />
        </label>
        <SubmitButton variant="outline">Send invite</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** What each status is called from the side of the person choosing it. */
const STATE_LABELS: Record<"vendor" | "brand", Record<VendorState, string>> = {
  vendor: { working: "Working", waitingOnYou: "Waiting on the brand", backlogged: "Backlogged" },
  brand: { working: "Working", waitingOnYou: "Waiting on you", backlogged: "Backlogged" },
};
const STATES: VendorState[] = ["working", "waitingOnYou", "backlogged"];

/**
 * One tap sets Working or Waiting. Backlogged asks for the date work can start first,
 * because that date is what moves the in-store projection.
 */
export function VendorStatusForm({ programId, current, side, today }: { programId: string; current?: VendorState; side: "vendor" | "brand"; today: string }) {
  const [state, action] = useActionState(setVendorStatusAction, {});
  const [backlog, setBacklog] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Status">
        {STATES.map((key) => {
          const style = VENDOR_STYLES[key];
          const selected = current === key;
          const props = {
            "aria-pressed": selected,
            className: "inline-flex h-12 flex-[1_1_150px] items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-semibold",
            style: { background: selected ? style.tint : "var(--color-surface)", color: style.text, borderColor: selected ? style.dot : "var(--color-control)" },
          };
          const content = <><StatusIcon style={style} size={14} />{STATE_LABELS[side][key]}</>;
          return key === "backlogged" ? (
            <button key={key} type="button" {...props} aria-expanded={backlog} onClick={() => setBacklog((open) => !open)}>{content}</button>
          ) : (
            <button key={key} type="submit" name="state" value={key} formNoValidate {...props}>{content}</button>
          );
        })}
      </div>
      {backlog && (
        <div className="flex flex-wrap items-end gap-3 rounded-[14px] p-4" style={{ background: VENDOR_STYLES.backlogged.tint }}>
          <label className={`${LABEL} flex-[0_1_220px]`}>
            {side === "vendor" ? "When can you start?" : "When can they start?"}
            <input name="expectedStart" type="date" min={today} required className={FIELD} />
          </label>
          <button type="submit" name="state" value="backlogged" className="h-12 rounded-xl bg-ink px-5 text-sm font-semibold text-white">Save as backlogged</button>
        </div>
      )}
      <label className={LABEL}>
        <span>Note <span className="font-normal text-muted">(optional, saved with your next status)</span></span>
        <input name="note" maxLength={500} placeholder={side === "vendor" ? "For example: waiting on final artwork" : "For example: confirmed by phone"} className={FIELD} />
      </label>
      <FormMessage state={state} />
    </form>
  );
}

export function VendorMilestoneForm({ programId, milestone, label }: { programId: string; milestone: string; label: string }) {
  const [state, action] = useActionState(completeVendorMilestoneAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="milestone" value={milestone} />
      <SubmitButton className="self-start">Mark “{label}” done today</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AssignVendorForm({ programId, vendors, current }: { programId: string; vendors: { id: string; name: string }[]; current?: string }) {
  const [state, action] = useActionState(assignVendorAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="programId" value={programId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} flex-[1_1_220px]`}>
          {current ? "Change vendor" : "Choose a vendor"}
          <select name="vendorId" required defaultValue={current ?? ""} className={FIELD}>
            <option value="" disabled>Choose a vendor</option>
            {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select>
        </label>
        <SubmitButton variant="outline">Save vendor</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
