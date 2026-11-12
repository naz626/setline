import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GuidelineLinks } from "@/components/Guidelines";
import { SubmitProofForm } from "@/components/ProofForms";
import { StatusPill } from "@/components/StatusPill";
import { VendorMilestoneForm, VendorStatusForm } from "@/components/VendorForms";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { FILE_LABELS, listProgramFiles } from "@/lib/services/files";
import { guidelinesForProgram } from "@/lib/services/guidelines";
import { listProgramViews } from "@/lib/services/programs";
import type { ProgramView } from "@/lib/services/programs";
import { PROOF_KINDS, PROOF_LABELS, approvalStatus, listProofsForProgram } from "@/lib/services/proofs";
import type { Member } from "@/lib/services/member";
import { APPROVAL_STYLES, VENDOR_STYLES } from "@/lib/status";
import { MILESTONE_LABELS, MILESTONE_OWNER, daysBetween, formatLong, formatShort } from "@/lib/timeline";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";

/** What the vendor is told about the next date, in their words. */
function nextUp(view: ProgramView): string {
  const { next, planned, today } = view;
  if (!next) return "Everything is done.";
  const who = MILESTONE_OWNER[next] === "vendor" ? "You" : "The brand";
  const due = planned[next];
  const when = due < today ? `was due ${formatShort(due)}, ${daysBetween(due, today)} days ago` : due === today ? "is due today" : `is due ${formatShort(due)}, in ${daysBetween(today, due)} days`;
  return `${MILESTONE_LABELS[next]} ${when}. ${who === "You" ? "This one is yours." : "This one is with the brand."}`;
}

async function ProgramCard({ view, member }: { view: ProgramView; member: Member }) {
  const db = await getDb();
  const { program, next, completed, today } = view;
  const [proofRows, guidelineItems, files] = await Promise.all([listProofsForProgram(db, member, program.id), guidelinesForProgram(db, member, program), listProgramFiles(db, member, program.id)]);
  const approvals = PROOF_KINDS.map((kind) => {
    const latest = proofRows.find((p) => p.kind === kind);
    return { kind, latest, status: approvalStatus(Boolean(completed[kind]), latest) };
  });
  const sendable = approvals.filter((a) => a.status === "awaitingProof" || a.status === "changesRequested").map((a) => ({ id: a.kind, label: PROOF_LABELS[a.kind] }));
  const vendorStep = next === "productionComplete" || next === "shipped" ? next : undefined;
  const reported = program.vendorState ?? undefined;

  return (
    <article className={`${CARD} flex flex-col gap-5`} aria-labelledby={`program-${program.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`program-${program.id}`} className="font-display text-2xl font-bold tracking-tight">{program.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {[program.retailer, program.displayType, program.storeCount ? `${program.storeCount.toLocaleString("en-US")} stores` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-muted">In store</div>
          <div className="font-display text-xl font-bold">{formatLong(program.inStoreDate)}</div>
        </div>
      </div>

      <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm font-medium">{nextUp(view)}</p>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-lg font-bold">Where are you on this?</h3>
          {reported ? <StatusPill style={{ ...VENDOR_STYLES[reported], label: reported === "waitingOnYou" ? "Waiting on the brand" : VENDOR_STYLES[reported].label }} /> : <span className="text-[13px] text-muted">No status yet</span>}
          {reported === "backlogged" && program.backloggedUntil && <span className="text-[13px] text-muted">Starting {formatShort(program.backloggedUntil)}</span>}
        </div>
        <VendorStatusForm programId={program.id} current={reported} side="vendor" today={today} />
        {vendorStep && <VendorMilestoneForm programId={program.id} milestone={vendorStep} label={MILESTONE_LABELS[vendorStep]} />}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold">Quotes and proofs</h3>
        <ul>
          {approvals.map(({ kind, latest, status }) => (
            <li key={kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
              <span className="text-sm font-semibold">{PROOF_LABELS[kind]}</span>
              <span className="flex flex-wrap items-center gap-3">
                <StatusPill style={{ ...APPROVAL_STYLES[status], label: status === "needsDecision" ? "With the brand" : status === "awaitingProof" ? "Not sent yet" : APPROVAL_STYLES[status].label }} />
                {latest && <Link href={`/approvals/${latest.id}`} className="inline-block py-2.5 text-[13px] font-semibold underline hover:text-accent-text">Version {latest.version}<span className="sr-only"> of the {PROOF_LABELS[kind].toLowerCase()} for {program.name}</span></Link>}
              </span>
            </li>
          ))}
        </ul>
        {sendable.length > 0 && (
          <details className="rounded-[14px] border border-line">
            <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Send a quote or proof</summary>
            <div className="border-t border-line p-4"><SubmitProofForm programId={program.id} kinds={sendable} /></div>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-bold">Files from the brand</h3>
        {files.length === 0 ? <p className="text-sm text-muted">No files yet.</p> : (
          <ul>
            {files.map((file) => (
              <li key={file.id} className="border-b border-line py-1 last:border-b-0">
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2.5 text-sm font-semibold underline hover:text-accent-text">
                  {FILE_LABELS[file.kind]}<span className="sr-only"> for {program.name} (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-bold">Guidelines for this program</h3>
        <GuidelineLinks items={guidelineItems} />
      </section>

      <Link href={`/programs/${program.id}/stores`} className="inline-block self-start py-2.5 text-sm font-semibold underline hover:text-accent-text">Store rollout for {program.name}</Link>
    </article>
  );
}

async function Portal() {
  const member = await requireMember();
  if (member.membership.role !== "vendorGuest") redirect("/vendors");
  const views = await listProgramViews(await getDb(), member);
  const open = views.filter((v) => !v.completed.inStore).sort((a, b) => a.program.inStoreDate.localeCompare(b.program.inStoreDate));
  const done = views.filter((v) => v.completed.inStore);

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Your programs</h1>
        <p className="mt-1.5 text-[15px] text-muted">Programs {member.workspace.name} has sent you. One tap tells them where things stand.</p>
      </div>
      {open.length === 0 && (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">Nothing open right now</h2>
          <p className="mt-2 text-sm text-muted">When {member.workspace.name} sends you a program, it will show up here.</p>
        </section>
      )}
      {open.map((view) => <ProgramCard key={view.program.id} view={view} member={member} />)}
      {done.length > 0 && (
        <section className={CARD}>
          <h2 className="font-display text-xl font-bold">In store</h2>
          <ul className="mt-2">
            {done.map((v) => (
              <li key={v.program.id} className="flex flex-wrap justify-between gap-3 border-b border-line py-3 text-sm last:border-b-0">
                <span className="font-semibold">{v.program.name}</span>
                <span className="text-muted">In store {formatShort(v.completed.inStore!)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function VendorPortalPage() {
  return (
    <AppShell active="/vendor">
      <Portal />
    </AppShell>
  );
}
