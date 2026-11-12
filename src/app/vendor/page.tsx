import Link from "next/link";
import { redirect } from "next/navigation";
import { acknowledgeChangeAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { GuidelineLinks } from "@/components/Guidelines";
import { SubmitProofForm } from "@/components/ProofForms";
import { StatusPill } from "@/components/StatusPill";
import { VendorMilestoneForm, VendorStatusForm } from "@/components/VendorForms";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { CHANGE_LABELS, listChanges } from "@/lib/services/changes";
import { FILE_LABELS, listProgramFiles } from "@/lib/services/files";
import { guidelinesForProgram } from "@/lib/services/guidelines";
import { listProgramViews } from "@/lib/services/programs";
import type { ProgramView } from "@/lib/services/programs";
import { PROOF_KINDS, PROOF_LABELS, approvalStatus, listProofsForProgram } from "@/lib/services/proofs";
import type { Member } from "@/lib/services/member";
import { APPROVAL_STYLES, HEALTH_STYLES, VENDOR_STYLES } from "@/lib/status";
import { formatStamp } from "@/lib/today";
import { MILESTONE_LABELS, MILESTONE_OWNER, daysBetween, formatLong, formatShort } from "@/lib/timeline";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";

/** What the vendor is told about the next date, in their words. */
function nextUp(view: ProgramView): string {
  const { next, planned, today } = view;
  if (!next) return "Everything is done.";
  const who = MILESTONE_OWNER[next] === "vendor" ? "You" : "The brand";
  const due = planned[next];
  const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;
  const when = due < today ? `was due ${formatShort(due)}, ${days(daysBetween(due, today))} ago` : due === today ? "is due today" : `is due ${formatShort(due)}, in ${days(daysBetween(today, due))}`;
  return `${MILESTONE_LABELS[next]} ${when}. ${who === "You" ? "This one is yours." : "This one is with the brand."}`;
}

async function ProgramCard({ view, member }: { view: ProgramView; member: Member }) {
  const db = await getDb();
  const { program, next, completed, today } = view;
  const [proofRows, guidelineItems, files, changes] = await Promise.all([
    listProofsForProgram(db, member, program.id), guidelinesForProgram(db, member, program), listProgramFiles(db, member, program.id), listChanges(db, member, program.id),
  ]);
  const unseen = changes.filter((change) => !change.acknowledgedAt);
  const zone = member.workspace.timezone;
  const approvals = PROOF_KINDS.map((kind) => {
    const versions = proofRows.filter((p) => p.kind === kind);
    return { kind, latest: versions[0], count: versions.length, status: approvalStatus(Boolean(completed[kind]), versions[0]) };
  });
  // A new version can be sent at any point until the program ships.
  const sendable = completed.shipped ? [] : PROOF_KINDS.map((kind) => ({ id: kind, label: PROOF_LABELS[kind] }));
  // When the next key date is an approval with nothing in front of the brand, the next move is the vendor's.
  const yours = approvals.find((a) => a.kind === next && (a.status === "awaitingProof" || a.status === "changesRequested"));
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

      <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm font-medium">{yours ? `The brand is waiting for ${yours.count > 0 ? "a new version of the" : "the"} ${PROOF_LABELS[yours.kind].toLowerCase()} from you. It was planned to be approved by ${formatShort(view.planned[yours.kind])}.` : nextUp(view)}</p>

      {changes.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[14px] p-4" style={{ background: unseen.length > 0 ? HEALTH_STYLES.atRisk.tint : undefined, border: unseen.length > 0 ? undefined : "1px solid var(--color-line)" }}>
          <h3 className="font-display text-lg font-bold">{unseen.length > 0 ? `${unseen.length} ${unseen.length === 1 ? "change" : "changes"} from the brand to confirm` : "Changes from the brand"}</h3>
          <ul>
            {changes.map((change) => (
              <li key={change.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink/15 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-[1_1_260px]">
                  <p className="text-sm"><span className="font-semibold">{CHANGE_LABELS[change.category]}:</span> {change.summary}</p>
                  {change.reopened.length > 0 && <p className="text-[13px] font-semibold">Needs a new version: {change.reopened.map((kind) => PROOF_LABELS[kind].toLowerCase()).join(", ")}</p>}
                  <p className="text-[13px] text-muted">{formatStamp(change.createdAt, zone)}{change.acknowledgedAt ? ` · confirmed ${formatStamp(change.acknowledgedAt, zone)}` : ""}</p>
                </div>
                {!change.acknowledgedAt && (
                  <form action={acknowledgeChangeAction}>
                    <input type="hidden" name="changeId" value={change.id} />
                    <button type="submit" className="h-12 rounded-xl bg-ink px-5 text-sm font-semibold text-white">Got it<span className="sr-only">: {change.summary}</span></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
          {approvals.map(({ kind, latest, count, status }) => (
            <li key={kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
              <span className="text-sm font-semibold">{PROOF_LABELS[kind]}</span>
              <span className="flex flex-wrap items-center gap-3">
                <StatusPill style={{ ...APPROVAL_STYLES[status], label: status === "needsDecision" ? "With the brand" : status === "awaitingProof" ? (count > 0 ? "Needs a new version" : "Not sent yet") : APPROVAL_STYLES[status].label }} />
                {latest && <Link href={`/approvals/${latest.id}`} className="inline-block py-2.5 text-[13px] font-semibold underline hover:text-accent-text">Version {latest.version}{count > 1 ? ` of ${count}` : ""}<span className="sr-only"> of the {PROOF_LABELS[kind].toLowerCase()} for {program.name}</span></Link>}
              </span>
            </li>
          ))}
        </ul>
        {sendable.length > 0 && (
          <details className="rounded-[14px] border border-line">
            <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Send a quote, proof or new version</summary>
            <div className="border-t border-line p-4">
              <SubmitProofForm programId={program.id} kinds={sendable} />
              <p className="mt-2 text-[13px] text-muted">You can send a new version at any point until the program ships. A new version of something already approved goes back to the brand for approval.</p>
            </div>
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
