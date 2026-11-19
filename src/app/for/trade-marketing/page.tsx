import type { Metadata } from "next";
import { PersonaLanding } from "@/components/PersonaLanding";

export const metadata: Metadata = {
  title: "Setline for trade & shopper marketing teams",
  description: "Track every floor stand, endcap and shelf display back from the in-store date your retail team committed to.",
};

export default function TradeMarketingLanding() {
  return (
    <PersonaLanding
      kicker="For trade and shopper marketing managers"
      headline="Your floor display lands the week your retail team promised. Every time."
      subhead="You committed a date to the retailer. Setline tracks every program back from that date, so you know weeks out whether artwork, proofs or production will make you miss it."
      points={[
        { title: "Counted back from the in-store date", body: "Give Setline the date the display has to be on the floor. It works backward through artwork, proofs, production and shipping, using the lead times your vendors actually run." },
        { title: "Know what will slip, early", body: "Every program shows on track, at risk or will miss, with the exact step holding it up. You find out from Setline, not from a retailer asking where the display is." },
        { title: "Approvals in one place", body: "Proofs, changes requested and sign-offs stay with the program, with a trail of who approved what and when — no more digging through email threads before a retail review." },
        { title: "Vendors and retailers join free", body: "Your display vendors and retailer contacts get their own simple view at no charge. Only your brand team counts toward your plan." },
      ]}
    />
  );
}
