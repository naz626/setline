import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { applyCheckoutCompleted, applySubscriptionCanceled, applySubscriptionUpdated } from "@/lib/services/billing";
import { verifyStripeSignature } from "@/lib/stripe";

/**
 * Stripe calls this after checkout and on every later subscription change. The signature is checked
 * against the raw body before anything is parsed, so a request that did not come from Stripe is refused.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Stripe is not configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing Stripe-Signature header.", { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = verifyStripeSignature(payload, signature, secret);
  } catch (error) {
    return new NextResponse((error as Error).message, { status: 400 });
  }

  const db = await getDb();
  const object = event.data.object;
  try {
    if (event.type === "checkout.session.completed") await applyCheckoutCompleted(db, object);
    else if (event.type === "customer.subscription.updated") await applySubscriptionUpdated(db, object);
    else if (event.type === "customer.subscription.deleted") await applySubscriptionCanceled(db, String(object.customer ?? ""));
  } catch (error) {
    console.error(`Setline: could not apply Stripe webhook (${event.type}).`, error);
    // Answer 200 anyway: Stripe retries on failure, and a workspace stuck on the wrong plan is fixed
    // by the operator override, not by Stripe hammering an endpoint that keeps throwing.
  }
  return NextResponse.json({ received: true });
}
