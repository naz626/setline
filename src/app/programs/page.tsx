import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StageBar } from "@/components/StageBar";
import { StatusIcon, StatusPill } from "@/components/StatusPill";
import { Tour } from "@/components/Tour";
import { can, isBrandRole } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { countUnseenChanges } from "@/lib/services/changes";
import { listProgramViews } from "@/lib/services/programs";
import { HEALTH_STYLES, STAGES, VENDOR_STYLES } from "@/lib/status";
import { daysBetween, formatShort } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";

async function Programs() {
  const member = await requireMember();
  // Vendor contacts have their own home, worded from their side.
  if (member.membership.role === "vendorGuest") redirect("/vendor");
  const db = await getDb();
  const [views, unseenChanges] = await Promise.all([listProgramViews(db, member), countUnseenChanges(db, member)]);
  const today = todayInZone(member.workspace.timezone);
  const canCreate = can(member.membership.role, "programs.create");
  const waiting = views.filter((v) => v.vendorState === "waitingOnYou" && v.health !== "complete");
  const atRisk = views.filter((v) => v.health === "atRisk").length;
  const willMiss = views.filter((v) => v.health === "willMiss").length;
  const upcoming = views
    .filter((v) => v.health !== "complete" && v.program.inStoreDate >= today)
    .sort((a, b) => a.program.inStoreDate.localeCompare(b.program.inStoreDate))[0];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Programs</h1>
          <p className="mt-1.5 text-[15px] text-muted">Here is what needs you today.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isBrandRole(member.membership.role) && <Tour autoStart />}
          {canCreate && (
            <Link href="/programs/new" className="inline-flex h-12 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-ink">New program</Link>
          )}
        </div>
      </div>

      {views.length === 0 ? (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">No programs yet</h2>
          <p className="mt-2 text-sm text-muted">
            {canCreate ? "Create your first program and Setline will work out every key date from the in-store date." : "Programs you can see will appear here."}
          </p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <section className="flex flex-[1_1_280px] flex-col gap-2 rounded-2xl p-5" style={{ background: VENDOR_STYLES.waitingOnYou.tint }}>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: VENDOR_STYLES.waitingOnYou.text }}>
                <StatusIcon style={VENDOR_STYLES.waitingOnYou} size={14} />
                Waiting on you
              </span>
              <span className="font-display text-[28px] font-bold">{waiting.length} {waiting.length === 1 ? "program" : "programs"}</span>
              <span className="text-[13px]">{waiting.map((v) => v.program.name).join(", ") || "Nothing is waiting on you."}</span>
            </section>
            <section className="flex flex-[1_1_280px] flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: HEALTH_STYLES.atRisk.text }}>
                <StatusIcon style={HEALTH_STYLES.atRisk} size={14} />
                Needs attention
              </span>
              <span className="font-display text-[28px] font-bold">{atRisk + willMiss} {atRisk + willMiss === 1 ? "program" : "programs"}</span>
              <span className="text-[13px] text-muted">{atRisk} at risk · {willMiss} will miss the in-store date</span>
            </section>
            <section className="flex flex-[1_1_280px] flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
              <span className="text-[13px] font-semibold text-muted">Next in-store date</span>
              <span className="font-display text-[28px] font-bold">{upcoming ? formatShort(upcoming.program.inStoreDate) : "None"}</span>
              {upcoming && <span className="text-[13px] text-muted">{upcoming.program.name} · {daysBetween(today, upcoming.program.inStoreDate)} days away</span>}
            </section>
          </div>

          <section className="rounded-[18px] border border-line bg-surface px-6 py-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
                    <th className="pb-2.5 font-semibold">Program</th>
                    <th className="pb-2.5 font-semibold">Stage</th>
                    <th className="pb-2.5 font-semibold">In store</th>
                    <th className="pb-2.5 font-semibold">Health</th>
                    <th className="pb-2.5 font-semibold">Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {views.map((view) => {
                    const health = HEALTH_STYLES[view.health];
                    const late = view.projected.inStore > view.planned.inStore;
                    return (
                      <tr key={view.program.id} className="border-b border-line last:border-b-0">
                        <td className="py-4 pr-4">
                          <Link href={`/programs/${view.program.id}`} className="inline-block py-1 text-[15px] font-semibold hover:text-accent-text">{view.program.name}</Link>
                          <div className="text-[13px] text-muted">{view.vendor?.name ?? "No vendor yet"}</div>
                          {unseenChanges.get(view.program.id) ? <div className="text-[13px] font-semibold text-[#7A4B00]">{unseenChanges.get(view.program.id)} {unseenChanges.get(view.program.id) === 1 ? "change" : "changes"} not seen by the vendor</div> : null}
                        </td>
                        <td className="py-4 pr-4">
                          <div className="mb-1.5 text-[13px] font-medium">{STAGES.find((s) => s.key === view.stage)?.label}</div>
                          <StageBar stage={view.stage} color={health.dot} complete={view.health === "complete"} />
                        </td>
                        <td className="py-4 pr-4 text-sm font-medium">
                          {formatShort(view.program.inStoreDate)}
                          {late && <div className="text-[12px] font-semibold" style={{ color: HEALTH_STYLES.willMiss.text }}>Projected {formatShort(view.projected.inStore)}</div>}
                        </td>
                        <td className="py-4 pr-4"><StatusPill style={health} /></td>
                        <td className="py-4">
                          {view.vendorState && view.health !== "complete" ? (
                            <StatusPill style={VENDOR_STYLES[view.vendorState]} />
                          ) : (
                            <span className="text-[13px] text-muted">{view.health === "complete" ? "Delivered" : view.vendor ? "No update yet" : "Not submitted"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function ProgramsPage() {
  return (
    <AppShell active="/programs">
      <Programs />
    </AppShell>
  );
}
