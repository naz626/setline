import type { Metadata } from "next";
import { Prose, PublicShell } from "@/components/PublicShell";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Security | Setline", description: "How Setline protects your programs, files and account." };

export default function Security() {
  const support = supportEmail();
  return (
    <PublicShell>
      <Prose title="Security" updated="November 16, 2026">
        <p>Your programs, proofs and vendor details are business-sensitive. Here is what we do to protect them, stated plainly, including what we have not done yet.</p>
        <h2>Sign-in</h2>
        <ul>
          <li>There are no passwords to steal. You sign in with a one-time link sent to your email.</li>
          <li>We store only a hash of each sign-in link and session token, never the token itself.</li>
          <li>Sessions are kept on our side and end when you sign out.</li>
        </ul>
        <h2>Who can see what</h2>
        <ul>
          <li>Every workspace is separate. Each request is checked against the workspace of the person making it.</li>
          <li>Roles control what people can do: brand admins, program managers, vendor guests and retailer guests each see only what their role allows. A vendor guest sees only that vendor&apos;s submitted programs, and a retailer guest only the submitted programs for their retailer.</li>
          <li>Changes are recorded in a log on each program.</li>
        </ul>
        <h2>Payments</h2>
        <p>Card payments are handled entirely by Stripe. Card numbers never reach Setline&apos;s servers or database.</p>
        <h2>Infrastructure</h2>
        <ul>
          <li>All traffic uses HTTPS.</li>
          <li>The app runs on Vercel and the database on Neon. Email is sent through Resend. Uploaded files are stored with Vercel Blob.</li>
        </ul>
        <h2>What we have not done</h2>
        <p>Setline has not completed a SOC 2 or similar audit, and does not offer single sign-on yet. If your company requires these, talk to us before you start.</p>
        <h2>Reporting a problem</h2>
        <p>If you think you have found a security issue, please tell us{support ? <> at <a href={`mailto:${support}`}>{support}</a></> : " through your account contact"} and give us a reasonable chance to fix it before sharing it more widely.</p>
      </Prose>
    </PublicShell>
  );
}
