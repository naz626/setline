import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildForward, isOwnMail, verifyWebhookSignature } from "./inbound";

const secretBytes = Buffer.from("a-test-signing-secret-of-some-length");
const secret = `whsec_${secretBytes.toString("base64")}`;
const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;

describe("webhook signature", () => {
  const body = '{"type":"email.received"}';
  const now = 1_800_000_000;
  const ts = String(now);

  it("accepts a correctly signed, recent request", () => {
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, secret, now)).toBe(true);
  });
  it("accepts one valid signature among several", () => {
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, secret, now)).toBe(true);
  });
  it("refuses a changed body, a wrong secret, missing headers, and an old timestamp", () => {
    const good = sign("msg_1", ts, body);
    expect(verifyWebhookSignature(body + " ", { id: "msg_1", timestamp: ts, signature: good }, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: good }, "whsec_b3RoZXI=", now)).toBe(false);
    expect(verifyWebhookSignature(body, { id: null, timestamp: ts, signature: good }, secret, now)).toBe(false);
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: good }, secret, now + 600)).toBe(false);
  });
});

describe("forwarding", () => {
  it("recognises mail from our own domain, with or without a display name", () => {
    expect(isOwnMail("Setline <hello@setline.team>", "setline.team")).toBe(true);
    expect(isOwnMail("hello@SETLINE.team", "setline.team")).toBe(true);
    expect(isOwnMail("Pat <pat@brand.test>", "setline.team")).toBe(false);
    expect(isOwnMail("x@notsetline.team", "setline.team")).toBe(false);
  });
  it("sends replies back to the original sender and escapes the header in html", () => {
    const out = buildForward({ from: "Pat <pat@brand.test>", to: ["support@setline.team"], subject: "Help", text: "Hi", html: "<b>Hi</b>" }, "me@example.test");
    expect(out.to).toBe("me@example.test");
    expect(out.replyTo).toBe("Pat <pat@brand.test>");
    expect(out.subject).toBe("[Support] Help");
    expect(out.text).toContain("Hi");
    expect(out.html).toContain("Pat &lt;pat@brand.test&gt;");
    expect(buildForward({ from: "a@b.test", to: ["support@setline.team"], subject: "", text: null }, "me@example.test").subject).toBe("[Support] (no subject)");
  });
});
