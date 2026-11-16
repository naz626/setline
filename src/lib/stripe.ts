import { createHmac, timingSafeEqual } from "crypto";
import type { PlanId } from "./plans";

/**
 * Talks to Stripe's REST API directly rather than pulling in its SDK, the same way email goes through
 * a plain fetch to Resend. Card checkout and subscription management run through Stripe Checkout and
 * the Billing Portal; Setline never collects or stores a card number itself.
 */
const API = "https://api.stripe.com/v1";

export function stripeConfigured(env = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Sales tax at checkout is switched on with STRIPE_TAX_ENABLED=true, and only once the business has a tax
 * registration in Stripe Tax. With Tax on but no registration, Stripe collects nothing while it looks as if it does.
 */
export function taxEnabled(env = process.env): boolean {
  return env.STRIPE_TAX_ENABLED === "true";
}

export type BillingInterval = "monthly" | "yearly";

/** Stripe price IDs are set up by hand in the dashboard; one env var per plan and billing interval. */
const PRICE_ENV: Record<string, string> = {
  starter_monthly: "STRIPE_PRICE_STARTER_MONTHLY",
  starter_yearly: "STRIPE_PRICE_STARTER_YEARLY",
  team_monthly: "STRIPE_PRICE_TEAM_MONTHLY",
  team_yearly: "STRIPE_PRICE_TEAM_YEARLY",
};

export function priceIdFor(plan: PlanId, interval: BillingInterval, env = process.env): string | undefined {
  const key = PRICE_ENV[`${plan}_${interval}`];
  return key ? env[key] : undefined;
}

/** Flattens nested params the way Stripe's form-encoded API expects: foo[bar]=baz, foo[0][bar]=baz. */
function flatten(params: Record<string, unknown>, prefix = ""): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && typeof value === "object") pairs.push(...flatten(value as Record<string, unknown>, name));
    else pairs.push([name, String(value)]);
  }
  return pairs;
}

/** A Stripe API error, with the code Stripe gave it (for example "resource_missing"). */
export class StripeError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "StripeError";
  }
}

/** True when Stripe says the customer id it was sent does not exist, such as a test-mode id used against live mode. */
export function isMissingCustomer(error: unknown): boolean {
  return error instanceof StripeError && error.code === "resource_missing" && /No such customer/i.test(error.message);
}

async function call(path: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  const body = new URLSearchParams(flatten(params));
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  if (!response.ok) {
    const err = data?.error as { message?: string; code?: string } | undefined;
    throw new StripeError(err?.message ?? `Stripe answered ${response.status}.`, err?.code);
  }
  return data;
}

export interface CheckoutSessionInput {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  workspaceId: string;
  plan: PlanId;
}

/** The parameters for a new subscription's Checkout session. Pure, so the tax options can be tested. */
export function checkoutParams(input: CheckoutSessionInput, env = process.env): Record<string, unknown> {
  const tax = taxEnabled(env);
  return {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: input.customerId,
    customer_email: input.customerId ? undefined : input.customerEmail,
    allow_promotion_codes: true,
    metadata: { workspaceId: input.workspaceId, plan: input.plan },
    subscription_data: { metadata: { workspaceId: input.workspaceId, plan: input.plan } },
    // Tax is worked out from the customer's billing address, so it has to be collected. A business can add a tax ID.
    ...(tax && {
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      // An existing customer's saved address and name are updated from what they enter, so tax uses the new address.
      customer_update: input.customerId ? { address: "auto", name: "auto" } : undefined,
    }),
  };
}

/** A hosted Stripe Checkout page for a new subscription. The session's URL is where the person is sent. */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<{ url: string }> {
  const session = await call("/checkout/sessions", checkoutParams(input));
  if (!session.url) throw new Error("Stripe did not return a checkout link.");
  return { url: session.url as string };
}

/** A hosted Stripe page where a customer can update their card, change plan or cancel. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const session = await call("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  if (!session.url) throw new Error("Stripe did not return a billing portal link.");
  return { url: session.url as string };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Checks a webhook request actually came from Stripe. The header looks like "t=<unix>,v1=<hex hmac>";
 * the signed payload is "<timestamp>.<raw body>", signed with the endpoint's signing secret.
 */
export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSeconds = 300): StripeEvent {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=") as [string, string]));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Malformed Stripe-Signature header.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
    throw new Error("The webhook signature does not match.");
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) throw new Error("The webhook timestamp is too old.");
  return JSON.parse(payload) as StripeEvent;
}
