import type { Metadata } from "next";
import { PersonaLanding } from "@/components/PersonaLanding";

export const metadata: Metadata = {
  title: "Setline for retail & visual merchandising teams",
  description: "Track store-by-store rollout, installation and sample approvals for every retail display program in one place.",
};

export default function RetailOpsLanding() {
  return (
    <PersonaLanding
      kicker="For retail and visual merchandising managers"
      headline="Stop hearing about a missed install from the store before you hear it from your vendor."
      subhead="Setline tracks every display program store by store — shipped, delivered, installed — so you catch a problem rollout days before it reaches the sales floor, not after."
      points={[
        { title: "Store-by-store rollout tracking", body: "See exactly how many of your stores are installed versus still in transit, for every program, without chasing vendor status updates by email." },
        { title: "Sample photos before the full rollout", body: "Approve or request changes on sample install photos before a vendor ships to every store, so a fixable problem doesn't become hundreds of returns." },
        { title: "Know what will slip, early", body: "Every program shows on track, at risk or will miss the in-store date, with the step that's holding it up — visible the moment it starts to drift." },
        { title: "Vendors and retailers join free", body: "Your display vendors and retailer contacts get their own simple view at no charge. Only your brand team counts toward your plan." },
      ]}
    />
  );
}
