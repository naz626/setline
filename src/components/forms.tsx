"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";

export const FIELD = "h-12 w-full rounded-[10px] border-[1.5px] border-control bg-surface px-3 text-[15px] font-medium text-ink";
export const LABEL = "flex flex-col gap-1.5 text-sm font-semibold";
const BUTTONS = {
  accent: "bg-accent text-ink",
  ink: "bg-ink text-white",
  outline: "border-[1.5px] border-ink text-ink",
};

export function SubmitButton({ children, variant = "ink", className = "" }: { children: React.ReactNode; variant?: keyof typeof BUTTONS; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`h-12 rounded-xl px-5 text-sm font-semibold disabled:opacity-60 ${BUTTONS[variant]} ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}

/** Shows the result of the last submit. Errors are announced to screen readers straight away. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return <p role="alert" className="rounded-[10px] bg-[#FADDDB] px-3.5 py-3 text-sm font-medium text-[#9B1C1C]">{state.error}</p>;
  }
  if (state.message) {
    return <p role="status" className="rounded-[10px] bg-[#DDF1E5] px-3.5 py-3 text-sm font-medium text-[#14633F]">{state.message}</p>;
  }
  return null;
}
