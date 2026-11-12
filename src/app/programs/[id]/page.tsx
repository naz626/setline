import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { acknowledgeChangeAction, removeProgramFileAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { GuidelineLinks } from "@/components/Guidelines";
import { AddFileForm, ChangeInStoreDateForm, CompleteMilestoneForm, EditDetailsForm, EditMilestoneForm, LogChangeForm, MoveInStoreDateForm, ProgramLeadTimesForm } from "@/components/ProgramForms";
import { SubmitProofForm } from "@/components/ProofForms";
import { AssignVendorForm, VendorStatusForm } from "@/components/VendorForms";
import { StatusPill } from "@/components/StatusPill";
import { can, isBrandRole } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listActivity } from "@/lib/services/activity";
import { CHANGE_LABELS, listChanges } from "@/lib/services/changes";
import { FILE_LABELS, listProgramFiles } from "@/lib/services/files";
import { guidelinesForProgram } from "@/lib/services/guidelines";
import { getProgramView } from "@/lib/services/programs";
import { PROOF_KINDS, PROOF_LABELS, approvalStatus, listProofsForProgram, versionStatus } from "@/lib/services/proofs";
import { listStores, storeStep } from "@/lib/services/stores";
import { listStatusHistory, listVendors } from "@/lib/services/vendors";
import { APPROVAL_STYLES, HEALTH_STYLES, STAGES, VENDOR_STYLES, VERSION_STYLES } from "@/lib/status";
import { formatStamp } from "@/lib/today";
import { MILESTONES, MILESTONE_LABELS, MILESTONE_OWNER, STEPS, STEP_LABELS, daysBetween, formatLong, formatShort } from "@/lib/timeline";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";

async function Program({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const role = member.membership.role;
  if (role === "vendorGuest") redirect("/vendor");
  const { id } = await params;
  const db = await getDb();
  const view = await getProgramView(db, member, id);
  if (!view) notFound();

  const canEdit = can(role, "programs.editSchedule");
  const seesProofs = can(role, "proofs.view");
  const [proofRows, guidelineItems, stores, history, vendorList, files, activity, changes] = await Promise.all([
    seesProofs ? listProofsForProgram(db, member, id) : [],
    guidelinesForProgram(db, member, view.program),
    listStores(db, member, id),
    listStatusHistory(db, member, id),
    canEdit ? listVendors(db, member) : [],
    listProgramFiles(db, member, id),
    isBrandRole(role) ? listActivity(db, member, view.program) : [],
    isBrandRole(role) ? listChanges(db, member, id) : [],
  ]);
  const canFiles = can(role, "files.manage");

  const { program, vendor, planned, projected, completed, next, health, vendorState, leadTimes, today } = view;
  const healthStyle = HEALTH_STYLES[health];
  const stageIndex = STAGES.findIndex((s) => s.key === view.stage);
  const late = projected.inStore > planned.inStore;
  const ownerName = { brand: "Brand team", vendor: vendor?.name ?? "Vendor", target: "Target" };
  const approvals = PROOF_KINDS.map((kind) => {
    const versions = proofRows.filter((p) => p.kind === kind);
    return { kind, latest: versions[0], versions, status: approvalStatus(Boolean(completed[kind]), versions[0]) };
  });
  const open = !completed.inStore;
  // New versions and reopened approvals are possible at any point until the program ships.
  const proofsOpen = open && !completed.shipped;
  const proofChoices = PROOF_KINDS.map((kind) => ({ id: kind, label: PROOF_LABELS[kind] }));
  const lastDone = [...MILESTONES].reverse().find((key) => completed[key]);
  const unseen = changes.filter((change) => !change.acknowledgedAt).length;
  const zone = member.workspace.timezone;
  const vendorChoices = vendorList.map((v) => ({ id: v.vendor.id, name: v.vendor.name }));
  const canChangeVendor = canEdit && open && !completed.productionComplete;
  const installed = stores.filter((s) => storeStep(s) === "installed").length;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-muted">
          <Link href="/programs" className="inline-block py-3 hover:text-accent-text">Programs</Link> / {program.name}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-bold tracking-tight">{program.name}</h1>
          <StatusPill style={healthStyle} />
          {vendorState && health !== "complete" && <StatusPill style={VENDOR_STYLES[vendorState]} />}
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-muted">
          <span>In store <strong className="font-semibold text-ink">{formatLong(program.inStoreDate)}</strong>{health !== "complete" && program.inStoreDate >= today && ` · ${daysBetween(today, program.inStoreDate)} days left`}</span>
          <span>Vendor <strong className="font-semibold text-ink">{vendor?.name ?? "Not chosen yet"}</strong></span>
          {program.retailer && <span>Retailer <strong className="font-semibold text-ink">{program.retailer}</strong></span>}
          <span>{program.displayType}{program.storeCount ? ` · ${program.storeCount} stores` : ""}</span>
        </div>
        {canEdit && (
          <details className="rounded-[14px] border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Edit details or change the in-store date</summary>
            <div className="flex flex-col gap-6 border-t border-line p-4">
              <EditDetailsForm program={{ id: program.id, name: program.name, retailer: program.retailer, displayType: program.displayType, storeCount: program.storeCount }} />
              {open && (
                <div className="border-t border-line pt-5">
                  <ChangeInStoreDateForm programId={program.id} current={program.inStoreDate} today={today} />
                  <p className="mt-2 text-[13px] text-muted">Every key date is counted back again from the new date. The change is added to the activity log.</p>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      {late && health !== "complete" && (
        <section className="rounded-[18px] p-6" style={{ background: HEALTH_STYLES.willMiss.tint }}>
          <h2 className="font-display text-[22px] font-bold">This program is {daysBetween(planned.inStore, projected.inStore)} days behind</h2>
          <p className="mt-2 text-sm leading-relaxed">
            {program.backloggedUntil && program.backloggedUntil > today
              ? `${vendor?.name} is backlogged and can start ${formatShort(program.backloggedUntil)}. `
              : "A deadline has passed. "}
            That moves the in-store date from {formatShort(planned.inStore)} to {formatShort(projected.inStore)}.
          </p>
          {canEdit && (
            <div className="mt-4 flex flex-col gap-2">
              <MoveInStoreDateForm programId={program.id} date={projected.inStore} label={formatShort(projected.inStore)} />
              {canChangeVendor && <p className="text-sm">Or keep the date and <a href="#vendor" className="font-semibold underline">choose another vendor</a> with shorter lead times.</p>}
            </div>
          )}
        </section>
      )}

      <ol className="flex flex-wrap gap-4 rounded-[18px] border border-line bg-surface px-6 py-5">
        {STAGES.map((stage, i) => {
          const reached = health === "complete" || i <= stageIndex;
          return (
            <li key={stage.key} className="flex flex-[1_1_140px] flex-col gap-2">
              <span className="h-2 rounded-full" style={{ background: reached ? healthStyle.dot : "var(--color-line)" }} aria-hidden="true" />
              <span className={`text-sm font-semibold ${reached ? "" : "text-muted"}`}>{stage.label}</span>
              {i === stageIndex && health !== "complete" && <span className="text-xs font-semibold" style={{ color: healthStyle.text }}>You are here</span>}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_560px] rounded-[18px] border border-line bg-surface px-6 py-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Key dates</h2>
            <span className="text-[13px] text-muted">Counted back from the {formatShort(program.inStoreDate)} in-store date</span>
          </div>
          <ul>
            {MILESTONES.map((key) => {
              const done = completed[key];
              const slipped = !done && projected[key] > planned[key];
              const isNext = key === next && health !== "complete";
              return (
                <li key={key} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3.5 last:border-b-0 ${isNext ? "font-semibold" : ""}`}>
                  <span className="w-20 font-display text-base font-bold">{formatShort(planned[key])}</span>
                  <span className="flex-[1_1_180px] text-sm">{MILESTONE_LABELS[key]}</span>
                  <span className="w-36 text-[13px] font-normal text-muted">{ownerName[MILESTONE_OWNER[key]]}</span>
                  <span className="flex min-w-36 flex-1 justify-end text-right text-[13px]" style={{ color: slipped ? HEALTH_STYLES.willMiss.text : undefined }}>
                    {done ? (canEdit ? (
                      <details className="group w-full text-right">
                        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-normal">Done {formatShort(done)} <span className="font-semibold underline group-open:hidden">Edit<span className="sr-only"> {MILESTONE_LABELS[key]}</span></span></summary>
                        <div className="mt-2 rounded-[14px] border border-line p-4">
                          <EditMilestoneForm programId={program.id} milestone={key} label={MILESTONE_LABELS[key]} doneOn={done} today={today} canUndo={key === lastDone} />
                        </div>
                      </details>
                    ) : `Done ${formatShort(done)}`) : isNext && canEdit ? (
                      <span className="flex flex-col items-end gap-1">
                        {slipped && <span>Now {formatShort(projected[key])}</span>}
                        <CompleteMilestoneForm programId={program.id} milestone={key} label={MILESTONE_LABELS[key]} />
                      </span>
                    ) : slipped ? `Now ${formatShort(projected[key])}` : isNext ? "Next up" : "Planned"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex-[1_1_320px] rounded-[18px] border border-line bg-surface px-6 py-5">
          <h2 className="font-display text-xl font-bold">Lead times used</h2>
          <p className="mt-1 text-[13px] text-muted">
            {vendor ? `${vendor.name} · made ${vendor.origin}` : "No vendor yet, so the workspace default applies."}
          </p>
          <ul className="mt-2">
            {STEPS.map((step) => {
              const lead = leadTimes[step];
              return (
                <li key={step} className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
                  <span className="text-right text-sm">
                    <strong className="font-semibold">{lead.days} {lead.unit} days</strong>
                    <span className="block text-xs text-muted">{lead.source.kind === "program" ? "Set for this program" : lead.source.profileName}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {canEdit && open && (
            <details className="mt-3 rounded-[14px] border border-line">
              <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Change for this program</summary>
              <div className="border-t border-line p-4">
                <ProgramLeadTimesForm programId={program.id} steps={STEPS.map((step) => ({ id: step, label: STEP_LABELS[step], days: leadTimes[step].days, unit: leadTimes[step].unit }))} />
                <p className="mt-2 text-[13px] text-muted">Only this program changes. A number that matches your profiles goes back to following them.</p>
              </div>
            </details>
          )}
          <Link href="/settings/lead-times" className="mt-3 inline-block py-3 text-sm font-semibold underline hover:text-accent-text">See how lead times are set</Link>
        </section>
      </div>

      {isBrandRole(role) && completed.submit && (
        <section className={`${CARD} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-bold">Changes</h2>
            {unseen > 0 && <StatusPill style={{ ...HEALTH_STYLES.atRisk, label: `${unseen} not seen by the vendor yet` }} />}
          </div>
          {changes.length === 0 ? <p className="text-sm text-muted">No changes since this program was submitted. Log one whenever artwork, structure, quantities, stores or dates change, so the vendor sees it and nothing is missed.</p> : (
            <ul>
              {changes.map((change) => (
                <li key={change.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
                  <div className="min-w-0 flex-[1_1_320px]">
                    <p className="text-sm"><span className="font-semibold">{CHANGE_LABELS[change.category]}:</span> {change.summary}</p>
                    {change.reopened.length > 0 && <p className="mt-0.5 text-[13px]" style={{ color: HEALTH_STYLES.atRisk.text }}>Reopened: {change.reopened.map((kind) => PROOF_LABELS[kind].toLowerCase()).join(", ")}</p>}
                    <p className="mt-0.5 text-[13px] text-muted">{formatStamp(change.createdAt, zone)}{change.by ? ` · ${change.by}` : ""}</p>
                  </div>
                  {change.acknowledgedAt ? (
                    <span className="text-[13px] text-muted">Seen {formatStamp(change.acknowledgedAt, zone)}{change.acknowledgedBy ? ` · ${change.acknowledgedBy}` : ""}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-[13px] font-semibold" style={{ color: HEALTH_STYLES.atRisk.text }}>Not seen yet</span>
                      {can(role, "changes.acknowledge") && (
                        <form action={acknowledgeChangeAction}>
                          <input type="hidden" name="changeId" value={change.id} />
                          <button type="submit" className="h-11 rounded-[10px] border-[1.5px] border-ink px-3.5 text-[13px] font-semibold">Vendor confirmed<span className="sr-only"> this change: {change.summary}</span></button>
                        </form>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {open && can(role, "changes.log") && (
            <details className="rounded-[14px] border border-line">
              <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Log a change</summary>
              <div className="border-t border-line p-4"><LogChangeForm programId={program.id} approvals={proofsOpen && vendor ? proofChoices : []} /></div>
            </details>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <section id="vendor" className={`${CARD} flex min-w-0 flex-[1_1_420px] scroll-mt-6 flex-col gap-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-bold">Vendor</h2>
            {vendor && <span className="text-sm font-semibold">{vendor.name}</span>}
            {vendor && open && (program.vendorState ? <StatusPill style={VENDOR_STYLES[program.vendorState]} /> : <span className="text-[13px] text-muted">No update yet</span>)}
            {program.vendorState === "backlogged" && program.backloggedUntil && open && <span className="text-[13px] text-muted">Can start {formatShort(program.backloggedUntil)}</span>}
          </div>
          {!vendor && <p className="text-sm text-muted">No vendor yet. Choosing one switches the key dates to that vendor&rsquo;s lead times.</p>}
          {vendor && open && can(role, "vendorStatus.set") && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Log what {vendor.name} told you</h3>
              <VendorStatusForm programId={program.id} current={program.vendorState ?? undefined} side="brand" today={today} />
            </div>
          )}
          {history.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Status history</h3>
              <ul className="mt-1">
                {history.map((event) => (
                  <li key={event.id} className="border-b border-line py-2.5 text-sm last:border-b-0">
                    <span className="font-semibold">{VENDOR_STYLES[event.state].label}</span>
                    {event.expectedStart && `, can start ${formatShort(event.expectedStart)}`}
                    <span className="text-[13px] text-muted"> · {formatStamp(event.createdAt, member.workspace.timezone)}{event.by ? ` · ${event.by}` : ""}</span>
                    {event.note && <span className="block text-[13px]">“{event.note}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canChangeVendor && (vendorChoices.length > 0
            ? <AssignVendorForm programId={program.id} vendors={vendorChoices} current={vendor?.id} />
            : <p className="text-sm text-muted">Add a vendor on the <Link href="/vendors" className="font-semibold text-ink underline">Vendors</Link> page first.</p>)}
        </section>

        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
          {seesProofs && (
            <section className={`${CARD} flex flex-col gap-2`}>
              <h2 className="font-display text-xl font-bold">Quotes and proofs</h2>
              {!vendor ? <p className="text-sm text-muted">Choose a vendor to start sending and approving proofs.</p> : (
                <>
                  <ul>
                    {approvals.map(({ kind, versions, status }) => (
                      <li key={kind} className="border-b border-line py-2.5 last:border-b-0">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="text-sm font-semibold">{PROOF_LABELS[kind]}</span>
                          <StatusPill style={status === "awaitingProof" && versions.length > 0 ? { ...APPROVAL_STYLES.awaitingProof, label: "Needs a new version" } : APPROVAL_STYLES[status]} />
                        </div>
                        {versions.length > 0 && (
                          <ul className="mt-1">
                            {versions.map((version, i) => {
                              const state = versionStatus(version, i === 0);
                              return (
                                <li key={version.id} className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]">
                                  <Link href={`/approvals/${version.id}`} className="inline-block py-2.5 font-semibold underline hover:text-accent-text">
                                    {state === "needsDecision" && can(role, "proofs.decide") ? "Review version" : "Version"} {version.version}<span className="sr-only"> of the {PROOF_LABELS[kind].toLowerCase()}</span>
                                  </Link>
                                  <span className="text-muted">{VERSION_STYLES[state].label} · sent {formatStamp(version.createdAt, zone)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                  {proofsOpen && can(role, "proofs.submit") && (
                    <details className="rounded-[14px] border border-line">
                      <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Add a new version the vendor sent you</summary>
                      <div className="border-t border-line p-4">
                        <SubmitProofForm programId={program.id} kinds={proofChoices} />
                        <p className="mt-2 text-[13px] text-muted">You can add a version at any point until the program ships. A new version of something already approved reopens that approval.</p>
                      </div>
                    </details>
                  )}
                </>
              )}
            </section>
          )}

          <section className={`${CARD} flex flex-col gap-2`}>
            <h2 className="font-display text-xl font-bold">Files for the vendor</h2>
            {files.length === 0 ? <p className="text-sm text-muted">No files yet. Link the artwork, specs, quantities and ship-to list so the vendor has what they need.</p> : (
              <ul>
                {files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center justify-between gap-x-3 border-b border-line py-1.5 last:border-b-0">
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2 text-sm font-semibold underline hover:text-accent-text">
                      {FILE_LABELS[file.kind]}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <span className="flex items-center gap-3">
                      <span className="max-w-[220px] truncate text-[13px] text-muted">{new URL(file.url).hostname}</span>
                      {canFiles && (
                        <form action={removeProgramFileAction}>
                          <input type="hidden" name="fileId" value={file.id} />
                          <button type="submit" className="h-11 rounded-[10px] border-[1.5px] border-control px-3 text-[13px] font-semibold text-muted">Remove<span className="sr-only"> {FILE_LABELS[file.kind]}</span></button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canFiles && (
              <details className="rounded-[14px] border border-line">
                <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Add a file</summary>
                <div className="border-t border-line p-4"><AddFileForm programId={program.id} /></div>
              </details>
            )}
          </section>

          <section className={`${CARD} flex flex-col gap-1`}>
            <h2 className="font-display text-xl font-bold">Guidelines</h2>
            <GuidelineLinks items={guidelineItems} />
            {role !== "retailerGuest" && <Link href="/guidelines" className="inline-block self-start py-2.5 text-sm font-semibold underline hover:text-accent-text">Open the guidelines library</Link>}
          </section>

          <section className={`${CARD} flex flex-col gap-1`}>
            <h2 className="font-display text-xl font-bold">Store rollout</h2>
            <p className="text-sm text-muted">
              {stores.length === 0 ? "No store list yet. Add one to track shipping, delivery and installation store by store." : `${installed} of ${stores.length} ${stores.length === 1 ? "store" : "stores"} installed.`}
            </p>
            <Link href={`/programs/${program.id}/stores`} className="inline-block self-start py-2.5 text-sm font-semibold underline hover:text-accent-text">Open the store rollout</Link>
          </section>
        </div>
      </div>

      {activity.length > 0 && (
        <section className={CARD}>
          <h2 className="font-display text-xl font-bold">Activity</h2>
          <ol className="mt-2">
            {activity.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2.5 last:border-b-0">
                <span className="text-sm">{event.summary}</span>
                <span className="text-[13px] text-muted">{formatStamp(event.createdAt, member.workspace.timezone)}{event.by ? ` · ${event.by}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell active="/programs">
      <Program params={params} />
    </AppShell>
  );
}
