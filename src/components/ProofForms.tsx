"use client";

import { useActionState, useState } from "react";
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

export function CommentForm({ proofId, pin }: { proofId: string; pin?: { x: number; y: number } }) {
  const [state, action] = useActionState(addProofCommentAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="proofId" value={proofId} />
      {pin && <input type="hidden" name="pinX" value={pin.x} />}
      {pin && <input type="hidden" name="pinY" value={pin.y} />}
      <label className={LABEL}>
        {pin ? "Comment on this spot" : "Add a comment"}
        <textarea name="body" required maxLength={2000} rows={3} className={`${FIELD} h-auto py-2.5`} />
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="self-start">Post comment</SubmitButton>
    </form>
  );
}

export interface ProofPin {
  id: string;
  x: number;
  y: number;
  n: number;
}

/**
 * The proof's file shown inline with numbered markers for every pinned comment. Clicking the image
 * drops a new pin and opens a comment form anchored to that spot.
 */
export function PinnableProofImage({ proofId, src, pins }: { proofId: string; src: string; pins: ProofPin[] }) {
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative inline-block max-w-full cursor-crosshair self-start overflow-hidden rounded-[14px] border border-line"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPending({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="The proof file" className="block max-h-[70vh] max-w-full" />
        {pins.map((pin) => (
          <span key={pin.id} title={`Pin ${pin.n}`} aria-hidden
            className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white ring-2 ring-white"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}>
            {pin.n}
          </span>
        ))}
        {pending && (
          <span aria-hidden className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-ink ring-2 ring-white"
            style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}>+</span>
        )}
      </div>
      <p className="text-[13px] text-muted">Click the image to pin a comment to a spot on it.</p>
      {pending && (
        <div className="rounded-[14px] bg-canvas px-4 py-3">
          <CommentForm proofId={proofId} pin={pending} />
          <button type="button" onClick={() => setPending(null)} className="mt-2 text-[13px] font-semibold underline">Cancel</button>
        </div>
      )}
    </div>
  );
}
