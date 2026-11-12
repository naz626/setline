import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CompleteMilestoneForm } from "@/components/ProgramForms";
import { StatusPill } from "@/components/StatusPill";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getProgramView } from "@/lib/services/programs";
import { HEALTH_STYLES, STAGES, VENDOR_STYLES } from "@/lib/status";
import { MILESTONES, MILESTONE_LABELS, MILESTONE_OWNER, STEPS, STEP_LABELS, daysBetween, formatLong, formatShort } from "@/lib/timeline";

async function Program({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;
  const view = await getProgramView(await getDb(), member, id);
  if (!view) notFound();

  const { program, vendor, planned, projected, completed, next, health, vendorState, leadTimes, today } = view;
  const healthStyle = HEALTH_STYLES[health];
  const stageIndex = STAGES.findIndex((s) => s.key === view.stage);
  const late = projected.inStore > planned.inStore;
  const ownerName = { brand: "Brand team", vendor: vendor?.name ?? "Vendor", target: "Target" };
  const canEdit = can(member.membership.role, "programs.editSchedule");

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
        </div>
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
                    {done ? `Done ${formatShort(done)}` : isNext && canEdit ? (
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
          <Link href="/settings/lead-times" className="mt-3 inline-block py-3 text-sm font-semibold underline hover:text-accent-text">See how lead times are set</Link>
        </section>
      </div>
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
