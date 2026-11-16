import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { buildForward, isOwnMail, verifyWebhookSignature } from "@/lib/inbound";
import type { ReceivedEmail } from "@/lib/inbound";

/**
 * Resend calls this when mail arrives at our domain (support@ and the like). It sends only a notice,
 * so we fetch the message and forward it to SUPPORT_FORWARD_TO. The signature is checked against the raw body first.
 * A failure answers 500 so Resend tries again; mail from our own domain is ignored so forwarding can never loop.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const forwardTo = process.env.SUPPORT_FORWARD_TO;
  if (!secret || !forwardTo) return new NextResponse("Inbound mail is not set up.", { status: 503 });

  const payload = await request.text();
  const signed = verifyWebhookSignature(payload, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, secret);
  if (!signed) return new NextResponse("Invalid signature.", { status: 400 });

  let event: { type?: string; data?: { email_id?: string; from?: string } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new NextResponse("Invalid body.", { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return NextResponse.json({ ignored: true });
  if (!emailConfigured()) return new NextResponse("Email is not set up.", { status: 503 });
  if (isOwnMail(event.data.from ?? "", "setline.team")) return NextResponse.json({ ignored: "own mail" });

  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Could not read the received email (${response.status}).`);
    const received = (await response.json()) as ReceivedEmail;
    await sendEmail(buildForward(received, forwardTo));
    return NextResponse.json({ forwarded: true });
  } catch (error) {
    console.error("Setline: could not forward support mail.", error);
    return new NextResponse("Could not forward.", { status: 500 });
  }
}
