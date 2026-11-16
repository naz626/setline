import type { Metadata } from "next";
import { Prose, PublicShell } from "@/components/PublicShell";
import { DATA_RETENTION_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = { title: "Terms of Service | Setline", description: "The terms for using Setline." };

export default function Terms() {
  const support = supportEmail();
  return (
    <PublicShell>
      <Prose title="Terms of Service" updated="November 16, 2026">
        <p>These terms are an agreement between you and Setline (&ldquo;we&rdquo;, &ldquo;us&rdquo;) about your use of the Setline service at setline.team. By creating a workspace or signing in, you agree to them. If you use Setline for a company, you confirm you can bind that company.</p>
        <h2>The service</h2>
        <p>Setline helps brands plan and track retail display programs: timelines, approvals, vendors and files. We may improve, change or remove features over time, and will not remove a paid feature without notice.</p>
        <h2>Accounts and workspaces</h2>
        <ul>
          <li>You sign in with a link sent to your email. Keep your email account secure; anyone who can read your email can sign in as you.</li>
          <li>The person who creates a workspace is its admin and is responsible for who they invite and what roles they give.</li>
          <li>Vendor and retailer guests invited to a workspace can see what their role allows. The brand that invites them is responsible for that choice.</li>
        </ul>
        <h2>Your content</h2>
        <p>You own the programs, files and other content you put into Setline. You give us permission to store, process and display it only to run the service for you and the people you invite. You promise you have the right to upload what you upload.</p>
        <h2>Free trial and paid plans</h2>
        <ul>
          <li>New workspaces get a {TRIAL_DAYS}-day free trial with every Team feature. No card is needed to start.</li>
          <li>When the trial ends without a plan, the workspace becomes read-only. We keep your data for {DATA_RETENTION_DAYS} days after that, send a warning before deleting it, and then delete it.</li>
          <li>Paid plans are billed in advance, monthly or yearly, by card through Stripe. Prices are in US dollars and exclude sales tax, which is added at checkout where it applies.</li>
          <li>Plans renew automatically until cancelled. You can cancel at any time from the billing page; the plan stays active until the end of the period you paid for. We do not give refunds for partly used periods unless the law requires it or we say otherwise in writing.</li>
          <li>If a payment fails, we and Stripe will try again for several days. If it still fails, the subscription ends and the workspace becomes read-only.</li>
          <li>We may change prices with at least 30 days&apos; notice before your next renewal.</li>
        </ul>
        <h2>Acceptable use</h2>
        <p>Do not use Setline to break the law, to upload malicious files, to try to access another workspace, or to disrupt the service. We may suspend an account that does.</p>
        <h2>Availability and support</h2>
        <p>We work to keep Setline available but do not promise it will be uninterrupted or error-free. Timelines and risk flags are calculated from the dates and lead times you enter; they are a planning aid, and you remain responsible for confirming dates with your vendors and retailers.</p>
        <h2>Ending the agreement</h2>
        <p>You can stop using Setline at any time and may ask us to delete your workspace. We may suspend or end access for breach of these terms, with notice where we reasonably can.</p>
        <h2>Liability</h2>
        <p>To the extent the law allows, the service is provided &ldquo;as is&rdquo;, and our total liability for any claim is limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect or consequential losses, including missed retail dates or lost sales.</p>
        <h2>Changes and law</h2>
        <p>We may update these terms and will post the new date here; if a change is material we will email workspace admins. These terms are governed by the laws of the State of New York, and disputes will be heard in the courts located in New York.</p>
        <h2>Contact</h2>
        <p>{support ? <>Questions about these terms: <a href={`mailto:${support}`}>{support}</a>.</> : "Questions about these terms can be sent to your account contact at Setline."}</p>
      </Prose>
    </PublicShell>
  );
}
