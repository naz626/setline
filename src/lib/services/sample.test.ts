import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/timeline";
import type { LeadTimeProfile } from "@/lib/timeline";
import type { ProgramRow, VendorRow } from "@/lib/db/schema";
import { buildProgramView } from "./programs";
import { DEFAULT_STEPS, SAMPLE_PROFILES, SAMPLE_VENDORS, buildSamplePrograms } from "./sample";

describe("sample programs", () => {
  it("show one program in each state whatever day the workspace is created", () => {
    const profiles: LeadTimeProfile[] = [
      { id: "default", name: "Workspace default", scope: {}, steps: DEFAULT_STEPS },
      ...SAMPLE_PROFILES.map((p, i) => ({ id: `p${i}`, name: p.name, scope: { vendorId: p.vendorKey, origin: p.origin, process: p.process }, steps: p.steps })),
    ];
    for (let offset = 0; offset < 400; offset++) {
      const today = addDays("2026-11-12", offset);
      const healths = buildSamplePrograms(today).map((sample) => {
        const vendor = SAMPLE_VENDORS.find((v) => v.key === sample.vendorKey);
        const row = { ...sample, id: sample.name, vendorId: vendor?.key ?? null, leadTimeOverrides: sample.leadTimeOverrides ?? {}, backloggedUntil: sample.backloggedUntil ?? null, vendorState: sample.vendorState ?? null, verified: sample.verified ?? false } as unknown as ProgramRow;
        const vendorRow = vendor ? ({ ...vendor, id: vendor.key } as unknown as VendorRow) : undefined;
        return buildProgramView(row, vendorRow, profiles, today).health;
      });
      expect(healths, `created on ${today}`).toEqual(["atRisk", "willMiss", "onTrack", "notStarted", "complete"]);
    }
  });
});
