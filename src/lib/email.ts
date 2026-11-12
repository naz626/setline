export interface Email {
  to: string;
  subject: string;
  text: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set. Returns false when email is not set up. */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!emailConfigured()) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: email.to, subject: email.subject, text: email.text }),
  });
  if (!response.ok) throw new Error(`Email could not be sent (${response.status}).`);
  return true;
}
