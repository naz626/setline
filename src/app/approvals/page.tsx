import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusIcon } from "@/components/StatusPill";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PROOF_LABELS, listApprovalItems } from "@/lib/services/proofs";
import type { ApprovalItem, ApprovalStatus } from "@/lib/services/proofs";
import { APPROVAL_STYLES, HEALTH_STYLES } from "@/lib/status";
import { daysBetween, formatShort } from "@/lib/timeline";

const COLUMNS: ApprovalStatus[] = ["needsDecision", "changesRequested", "awaitingProof", "approved"];
/** The same four columns, named from the vendor's side. */
const VENDOR_TITLES: Record<ApprovalStatus, string> = {
  needsDecision: "With the brand",
  changesRequested: "Changes requested",
  awaitingProof: "Yours to send",
  approved: "Approved",
};

function Card({ item, vendorSide }: { item: ApprovalItem; vendorSide: boolean }) {
  const { view, kind, latest, due, overdue, status } = item;
  const href = latest ? `/approvals/${latest.id}` : vendorSide ? "/vendor" : `/programs/${view.program.id}`;
  return (
    <li className="rounded-[14px] border border-line bg-surface p-4">
      <Link href={href} className="block py-1 text-[15px] font-semibold hover:text-accent-text">
        {PROOF_LABELS[kind]}{latest ? ` · version ${latest.version}` : ""}<span className="sr-only"> for {view.program.name}</span>
      </Link>
      <p className="text-[13px] text-muted">{view.program.name}{view.vendor && !vendorSide ? ` · ${view.vendor.name}` : ""}</p>
      {status !== "approved" && (
        <p className="mt-2 text-[13px] font-semibold" style={{ color: overdue ? HEALTH_STYLES.willMiss.text : undefined }}>
          {overdue ? `Was due ${formatShort(due)}, ${daysBetween(due, view.today)} days ago` : `Due ${formatShort(due)}`}
        </p>
      )}
      {status === "changesRequested" && latest?.decisionNote && <p className="mt-2 text-[13px]">“{latest.decisionNote}”</p>}
    </li>
  );
}

async function Approvals() {
  const member = await requireMember();
  const role = member.membership.role;
  if (!can(role, "proofs.view")) redirect("/programs");
  const vendorSide = role === "vendorGuest";
  const items = await listApprovalItems(await getDb(), member);

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">{vendorSide ? "Proofs" : "Approvals"}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {vendorSide ? "Quotes and proofs you have sent, and what the brand said." : "Quotes and proofs across every open program. Approving one moves the timeline on."}
        </p>
      </div>

      {items.length === 0 ? (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">Nothing to approve yet</h2>
          <p className="mt-2 text-sm text-muted">Once a program is submitted to a vendor, its quote and proofs show up here.</p>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((status) => {
            const style = APPROVAL_STYLES[status];
            const matching = items.filter((item) => item.status === status);
            return (
              <section key={status} className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: style.tint }} aria-labelledby={`col-${status}`}>
                <h2 id={`col-${status}`} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: style.text }}>
                  <StatusIcon style={style} size={14} />
                  {vendorSide ? VENDOR_TITLES[status] : style.label}
                  <span className="ml-auto rounded-full bg-surface px-2.5 py-0.5 text-[13px]">{matching.length}</span>
                </h2>
                {matching.length === 0 ? <p className="text-[13px]" style={{ color: style.text }}>Nothing here.</p> : (
                  <ul className="flex flex-col gap-3">
                    {matching.map((item) => <Card key={`${item.view.program.id}-${item.kind}`} item={item} vendorSide={vendorSide} />)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <AppShell active="/approvals">
      <Approvals />
    </AppShell>
  );
}
