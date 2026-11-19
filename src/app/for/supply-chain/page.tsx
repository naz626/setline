import type { Metadata } from "next";
import { PersonaLanding } from "@/components/PersonaLanding";

export const metadata: Metadata = {
  title: "Setline for supply chain & operations teams",
  description: "See every vendor lead time and deadline that feeds into the in-store date, before it cascades into a miss.",
};

export default function SupplyChainLanding() {
  return (
    <PersonaLanding
      kicker="For supply chain and operations managers"
      headline="See every vendor deadline that feeds the in-store date, before it cascades."
      subhead="One late proof or a backlogged vendor pushes every date behind it. Setline works the schedule backward from the in-store date using the lead times each vendor actually runs, so you see the cascade coming."
      points={[
        { title: "Lead times by vendor, not guesswork", body: "Resolve lead times from profiles per vendor and display type, instead of hard-coded estimates that don't match how a given vendor actually runs." },
        { title: "Know what will slip, early", body: "Every program shows on track, at risk or will miss the in-store date, with the exact step holding it up — so you can act on a delay before it reaches production." },
        { title: "Backlogged vendors are visible immediately", body: "When a vendor logs that they're backlogged and when they can restart, every program's projected date recalculates automatically." },
        { title: "Vendors and retailers join free", body: "Your display vendors and retailer contacts get their own simple view at no charge. Only your brand team counts toward your plan." },
      ]}
    />
  );
}
