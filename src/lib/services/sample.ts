import { addDays, resolveLeadTimes, scheduleBackward, snapToWorkingDay, workingDaysBetween } from "@/lib/timeline";
import type { ISODate, LeadTimeProfile, MilestoneKey, Origin, StepDurations, VendorState } from "@/lib/timeline";

/**
 * Sample vendors, lead-time profiles and programs for a new workspace, placed around today
 * so there is always one program in each state to look at. Every lead time is a placeholder.
 */

const w = (days: number) => ({ days, unit: "working" as const });
const c = (days: number) => ({ days, unit: "calendar" as const });

export const DEFAULT_STEPS: StepDurations = {
  quote: w(5),
  structuralProof: w(10),
  printProof: w(10),
  production: w(20),
  shipPrep: w(2),
  transitAndSet: c(12),
};

export interface SampleVendor {
  key: string;
  name: string;
  makes: string;
  origin: Origin;
  process: string;
  source: "added" | "directory";
}

export interface SampleProfile {
  name: string;
  vendorKey?: string;
  origin?: Origin;
  process?: string;
  steps: Partial<StepDurations>;
}

export interface SampleProgram {
  name: string;
  retailer: string;
  displayType: string;
  storeCount?: number;
  inStoreDate: ISODate;
  vendorKey?: string;
  completed: Partial<Record<MilestoneKey, ISODate>>;
  vendorState?: VendorState;
  backloggedUntil?: ISODate;
  verified?: boolean;
  leadTimeOverrides?: Partial<StepDurations>;
}

export const SAMPLE_VENDORS: SampleVendor[] = [
  { key: "harbor", name: "Harbor Display Co.", makes: "Corrugate displays, counter units", origin: "domestic", process: "corrugate", source: "added" },
  { key: "fieldhouse", name: "Fieldhouse Print", makes: "Print, floor towers", origin: "domestic", process: "print", source: "added" },
  { key: "kestrel", name: "Kestrel Fixtures", makes: "Permanent fixtures, floor stands", origin: "overseas", process: "permanent", source: "directory" },
];

export const SAMPLE_PROFILES: SampleProfile[] = [
  { name: "Made overseas", origin: "overseas", steps: { production: w(30), transitAndSet: c(45) } },
  { name: "Permanent fixtures", process: "permanent", steps: { structuralProof: w(15), production: w(30) } },
  { name: "Print only", process: "print", steps: { production: w(10) } },
  { name: "Harbor Display Co.", vendorKey: "harbor", steps: { quote: w(3) } },
];

function engineProfiles(): LeadTimeProfile[] {
  return [
    { id: "default", name: "Workspace default", scope: {}, steps: DEFAULT_STEPS },
    ...SAMPLE_PROFILES.map((p, i) => ({ id: `sample-${i}`, name: p.name, scope: { vendorId: p.vendorKey, origin: p.origin, process: p.process }, steps: p.steps })),
  ];
}

function plan(inStoreDate: ISODate, vendorKey: string, overrides?: Partial<StepDurations>) {
  const vendor = SAMPLE_VENDORS.find((v) => v.key === vendorKey)!;
  const leadTimes = resolveLeadTimes(engineProfiles(), { vendorId: vendor.key, origin: vendor.origin, process: vendor.process }, overrides);
  return scheduleBackward(inStoreDate, leadTimes);
}

const before = (today: ISODate, days: number) => snapToWorkingDay(addDays(today, -days), -1);
const after = (today: ISODate, days: number) => snapToWorkingDay(addDays(today, days), 1);

export function buildSamplePrograms(today: ISODate): SampleProgram[] {
  // A compressed holiday schedule whose next approval is due within the next three working days.
  const holidayOverrides = { structuralProof: w(14), printProof: w(2), production: w(5), shipPrep: w(1), transitAndSet: c(5) };
  let holidayInStore = after(today, 12);
  for (let offset = 12; offset < 40; offset++) {
    const candidate = after(today, offset);
    const due = plan(candidate, "fieldhouse", holidayOverrides).structuralProofApproved;
    const left = workingDaysBetween(today, due);
    if (left >= 1 && left <= 3) {
      holidayInStore = candidate;
      break;
    }
  }
  const holiday = plan(holidayInStore, "fieldhouse", holidayOverrides);

  const sunCareInStore = after(today, 124);
  const sunCare = plan(sunCareInStore, "kestrel");

  const counterInStore = before(today, 30);
  const counter = plan(counterInStore, "harbor");

  return [
    {
      name: "Holiday Gift Tower",
      retailer: "Northline Beauty",
      displayType: "Floor tower",
      storeCount: 180,
      inStoreDate: holidayInStore,
      vendorKey: "fieldhouse",
      completed: { submit: holiday.submit, quoteApproved: holiday.quoteApproved },
      vendorState: "waitingOnYou",
      leadTimeOverrides: holidayOverrides,
    },
    {
      name: "Sun Care Floor Stand",
      retailer: "Northline Beauty",
      displayType: "Floor stand",
      storeCount: 300,
      inStoreDate: sunCareInStore,
      vendorKey: "kestrel",
      completed: { submit: before(today, 37), quoteApproved: before(today, 30), structuralProofApproved: before(today, 21), printProofApproved: before(today, 14) },
      vendorState: "backlogged",
      // The vendor cannot start until well after production was planned to begin.
      backloggedUntil: after(sunCare.printProofApproved, 12),
    },
    {
      name: "Spring Fragrance Endcap",
      retailer: "Northline Beauty",
      displayType: "Endcap",
      storeCount: 240,
      inStoreDate: after(today, 89),
      vendorKey: "harbor",
      completed: { submit: before(today, 44), quoteApproved: before(today, 41), structuralProofApproved: before(today, 23), printProofApproved: before(today, 9) },
      vendorState: "working",
    },
    {
      name: "Fall Skincare Shelf Tray",
      retailer: "Northline Beauty",
      displayType: "Shelf tray",
      inStoreDate: after(today, 202),
      completed: {},
    },
    {
      name: "Counter Unit Refresh",
      retailer: "Northline Beauty",
      displayType: "Counter unit",
      storeCount: 120,
      inStoreDate: counterInStore,
      vendorKey: "harbor",
      completed: { ...counter },
      verified: true,
    },
  ];
}
