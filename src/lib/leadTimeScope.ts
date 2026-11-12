import type { LeadTimeProfile, Origin } from "@/lib/timeline";

export interface PlannerVendor {
  id: string;
  name: string;
  origin: Origin;
  process: string;
}

/** Plain-words description of which programs a profile applies to. */
export function scopeText(profile: LeadTimeProfile, vendors: PlannerVendor[], processes: { id: string; label: string }[]): string {
  const parts: string[] = [];
  if (profile.scope.vendorId) parts.push(vendors.find((v) => v.id === profile.scope.vendorId)?.name ?? "One vendor");
  if (profile.scope.origin) parts.push(profile.scope.origin === "overseas" ? "Made overseas" : "Made domestically");
  if (profile.scope.process) parts.push(processes.find((p) => p.id === profile.scope.process)?.label ?? profile.scope.process);
  if (profile.scope.displayType) parts.push(profile.scope.displayType);
  return parts.length ? parts.join(" · ") : "Every program";
}
