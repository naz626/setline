"use client";

import { useMemo, useState } from "react";
import type { Vendor } from "@/lib/data/seed";
import { MILESTONES, MILESTONE_LABELS, STEPS, STEP_LABELS, formatLong, resolveLeadTimes, scheduleBackward } from "@/lib/timeline";
import type { LeadTimeProfile, Origin, StepDurations, StepKey } from "@/lib/timeline";

const FIELD = "h-12 w-full rounded-[10px] border-[1.5px] border-control bg-surface px-3 text-[15px] font-medium text-ink";

function scopeText(profile: LeadTimeProfile, vendors: Vendor[], processes: { id: string; label: string }[]): string {
  const parts: string[] = [];
  if (profile.scope.vendorId) parts.push(vendors.find((v) => v.id === profile.scope.vendorId)?.name ?? "One vendor");
  if (profile.scope.origin) parts.push(profile.scope.origin === "overseas" ? "Made overseas" : "Made domestically");
  if (profile.scope.process) parts.push(processes.find((p) => p.id === profile.scope.process)?.label ?? profile.scope.process);
  if (profile.scope.displayType) parts.push(profile.scope.displayType);
  return parts.length ? parts.join(" · ") : "Every program";
}

export function LeadTimePlanner({ profiles, vendors, processes }: {
  profiles: LeadTimeProfile[];
  vendors: Vendor[];
  processes: { id: string; label: string }[];
}) {
  const [vendorId, setVendorId] = useState("");
  const [origin, setOrigin] = useState<Origin>("domestic");
  const [process, setProcess] = useState(processes[0].id);
  const [inStore, setInStore] = useState("2027-04-19");
  const [overrides, setOverrides] = useState<Partial<StepDurations>>({});

  function pickVendor(id: string) {
    setVendorId(id);
    const vendor = vendors.find((v) => v.id === id);
    if (vendor) {
      setOrigin(vendor.origin);
      setProcess(vendor.process);
    }
  }

  const resolved = useMemo(
    () => resolveLeadTimes(profiles, { vendorId: vendorId || undefined, origin, process }, overrides),
    [profiles, vendorId, origin, process, overrides],
  );
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(inStore);
  const schedule = useMemo(() => (validDate ? scheduleBackward(inStore, resolved) : undefined), [validDate, inStore, resolved]);

  function setDays(step: StepKey, value: string) {
    const days = Number.parseInt(value, 10);
    if (Number.isNaN(days) || days < 0) return;
    setOverrides((current) => ({ ...current, [step]: { days, unit: resolved[step].unit } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[18px] border border-line bg-surface px-6 py-5">
        <h2 className="font-display text-xl font-bold">Your profiles</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="pb-2.5 font-semibold">Profile</th>
                <th className="pb-2.5 font-semibold">Applies to</th>
                <th className="pb-2.5 font-semibold">Sets</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-line last:border-b-0">
                  <td className="py-3.5 pr-4 font-semibold">{profile.name}</td>
                  <td className="py-3.5 pr-4 text-muted">{scopeText(profile, vendors, processes)}</td>
                  <td className="py-3.5">
                    {STEPS.filter((s) => profile.steps[s]).map((s) => `${STEP_LABELS[s]} ${profile.steps[s]!.days}d`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_520px] rounded-[18px] border border-line bg-surface px-6 py-5">
          <h2 className="font-display text-xl font-bold">Try it out</h2>
          <p className="mt-1 text-[13px] text-muted">Pick a situation and change any number. This is a preview and is not saved yet.</p>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">
              Vendor
              <select className={FIELD} value={vendorId} onChange={(e) => pickVendor(e.target.value)}>
                <option value="">No vendor yet</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
              Made
              <select className={FIELD} value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
                <option value="domestic">Domestically</option>
                <option value="overseas">Overseas</option>
              </select>
            </label>
            <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-sm font-semibold">
              Process
              <select className={FIELD} value={process} onChange={(e) => setProcess(e.target.value)}>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>

          <ul className="mt-5">
            {STEPS.map((step) => {
              const lead = resolved[step];
              return (
                <li key={step} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
                  <label htmlFor={`lt-${step}`} className="flex-[1_1_180px] text-sm font-semibold">{STEP_LABELS[step]}</label>
                  <span className="flex items-center gap-2">
                    <input id={`lt-${step}`} type="number" min={0} inputMode="numeric" className={`${FIELD.replace("w-full", "w-24")}`} value={lead.days} onChange={(e) => setDays(step, e.target.value)} />
                    <span className="w-28 text-[13px] text-muted">{lead.unit} days</span>
                  </span>
                  <span className="flex-[1_1_180px] text-[13px] text-muted">
                    {lead.source.kind === "program" ? "Changed here" : `From ${lead.source.profileName}`}
                  </span>
                </li>
              );
            })}
          </ul>
          {Object.keys(overrides).length > 0 && (
            <button type="button" onClick={() => setOverrides({})} className="mt-4 h-11 rounded-[10px] border-[1.5px] border-ink px-4 text-[13px] font-semibold">
              Reset my changes
            </button>
          )}
        </section>

        <section className="flex-[1_1_320px] rounded-[18px] bg-ink px-6 py-5 text-white">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            In-store date
            <input type="date" className="h-12 rounded-[10px] border-2 border-white bg-white px-3 font-display text-lg font-bold text-ink" value={inStore} onChange={(e) => setInStore(e.target.value)} />
          </label>
          {schedule ? (
            <ol className="mt-4">
              {MILESTONES.map((key) => (
                <li key={key} className="flex items-baseline justify-between gap-3 border-b border-white/25 py-3 last:border-b-0">
                  <span className="text-sm">{MILESTONE_LABELS[key]}</span>
                  <span className="text-right text-sm font-semibold">{formatLong(schedule[key])}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm">Enter an in-store date to see the key dates.</p>
          )}
        </section>
      </div>
    </div>
  );
}
