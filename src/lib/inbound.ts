import { createHmac, timingSafeEqual } from "node:crypto";

/** A message Resend received for our domain, as returned by its API. */
export interface ReceivedEmail {
  from: string;
  to: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
}

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Checks a Resend (Svix) webhook signature against the raw request body. The signed text is
 * "<id>.<timestamp>.<body>", signed with HMAC-SHA256 using the base64 part of the "whsec_" secret.
 * A request whose timestamp is more than five minutes off is refused, so a captured request cannot be replayed later.
 */
export function verifyWebhookSignature(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(nowSeconds - sent) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  // The header may hold several space-separated "v1,<signature>" entries, such as during a secret rotation.
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** True for mail we sent ourselves, which must never be forwarded again. */
export function isOwnMail(from: string, domain: string): boolean {
  const address = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  return address.endsWith(`@${domain.toLowerCase()}`);
}

/** The email to send on to the person who answers support mail, with replies going back to the original sender. */
export function buildForward(received: ReceivedEmail, to: string): { to: string; subject: string; text: string; html?: string; replyTo: string } {
  const header = `Forwarded support message\nFrom: ${received.from}\nTo: ${received.to.join(", ")}\n\n`;
  const text = received.text?.trim() ? received.text : "(This message has no plain-text body.)";
  return {
    to,
    subject: `[Support] ${received.subject || "(no subject)"}`,
    text: header + text,
    html: received.html ? `<p style="color:#666;font-size:13px">Forwarded support message<br>From: ${escapeHtml(received.from)}<br>To: ${escapeHtml(received.to.join(", "))}</p>${received.html}` : undefined,
    replyTo: received.from,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
