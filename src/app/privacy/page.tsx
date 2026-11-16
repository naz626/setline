import type { Metadata } from "next";
import { Prose, PublicShell } from "@/components/PublicShell";
import { DATA_RETENTION_DAYS } from "@/lib/plans";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Privacy Policy | Setline", description: "What Setline collects, why, and who it is shared with." };

export default function Privacy() {
  const support = supportEmail();
  return (
    <PublicShell>
      <Prose title="Privacy Policy" updated="November 16, 2026">
        <p>This policy explains what Setline collects when you use setline.team, why, and who handles it. We do not sell personal information and we do not run advertising or third-party analytics trackers.</p>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your email address, and your name or role if you give it.</li>
          <li><strong>Workspace content:</strong> programs, dates, vendors, retailers, lead times, guidelines, comments, approvals, and files such as artwork, proofs and store photos that you or your team upload.</li>
          <li><strong>Billing:</strong> if you pay by card, Stripe collects your card and billing address and tells us your plan, subscription status and customer reference. We never see or store your card number.</li>
          <li><strong>Sign-in and security data:</strong> a hash of your sign-in links and session tokens, and when sessions were created.</li>
        </ul>
        <h2>Cookies</h2>
        <p>We use one cookie, to keep you signed in. We do not use advertising or tracking cookies.</p>
        <h2>How we use it</h2>
        <ul>
          <li>To run Setline: show your programs, calculate timelines, send sign-in links, and send notifications you have turned on, such as approval requests and trial or payment reminders.</li>
          <li>To take payment and apply sales tax.</li>
          <li>To keep the service secure and fix problems.</li>
        </ul>
        <h2>Who handles it for us</h2>
        <p>We use these providers to run the service. Each only receives what it needs.</p>
        <ul>
          <li>Vercel: hosting and file storage.</li>
          <li>Neon: database.</li>
          <li>Resend: sending email.</li>
          <li>Stripe: payments, billing and sales tax.</li>
        </ul>
        <p>If you connect a Slack or Microsoft Teams webhook, alerts are sent to the address you provide. We may also disclose information if the law requires it.</p>
        <h2>Who in your workspace can see it</h2>
        <p>Your content is visible to the people you invite, according to their role. Vendor guests see their own vendor&apos;s submitted programs, and retailer guests the submitted programs for their retailer.</p>
        <h2>How long we keep it</h2>
        <p>We keep your data while your workspace is active. If a workspace ends without a plan it becomes read-only, and we delete it {DATA_RETENTION_DAYS} days later after a warning email. You can ask us to delete your workspace or your personal information sooner.</p>
        <h2>Your choices</h2>
        <p>You can ask to see, correct or delete the personal information we hold about you. If you are in a place with privacy laws that give you additional rights, such as California or the EU, you can use them by contacting us, and we will respond within the time the law allows.</p>
        <h2>Children</h2>
        <p>Setline is for businesses and is not directed to children under 16.</p>
        <h2>Changes</h2>
        <p>If we change this policy we will post the new date here and email workspace admins about material changes.</p>
        <h2>Contact</h2>
        <p>{support ? <>For privacy questions or requests: <a href={`mailto:${support}`}>{support}</a>.</> : "For privacy questions or requests, contact your account contact at Setline."}</p>
      </Prose>
    </PublicShell>
  );
}
