"use client";

import { useActionState } from "react";
import { beginCheckoutAction } from "@/app/actions";
import { FormMessage, SubmitButton } from "./forms";

/** One button that starts Stripe Checkout for a plan and billing interval. Redirects on success. */
export function CheckoutForm({ plan, interval, label }: { plan: string; interval: "monthly" | "yearly"; label: string }) {
  const [state, action] = useActionState(beginCheckoutAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <SubmitButton variant="outline">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
