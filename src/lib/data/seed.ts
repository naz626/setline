import type { ISODate, LeadTimeProfile, MilestoneKey, Origin, StepDurations, VendorState } from "@/lib/timeline";

/**
 * Sample data that mirrors the design prototype. It stands in for the database until one is wired up.
 * Every lead time here is a placeholder to be replaced with the workspace's real numbers.
 */

/** The sample programs are anchored to this date so the demo reads the same every day. */
export const DEMO_TODAY: ISODate = "2026-11-11";

const w = (days: number) => ({ days, unit: "working" as const });
const c = (days: number) => ({ days, unit: "calendar" as const });

export interface Vendor {
  id: string;
  name: string;
  makes: string;
  origin: Origin;
  process: string;
  source: "added" | "directory";
}

export const vendors: Vendor[] = [
  { id: "harbor", name: "Harbor Display Co.", makes: "Corrugate displays, counter units", origin: "domestic", process: "corrugate", source: "added" },
  { id: "fieldhouse", name: "Fieldhouse Print", makes: "Print, floor towers", origin: "domestic", process: "print", source: "added" },
  { id: "kestrel", name: "Kestrel Fixtures", makes: "Permanent fixtures, floor stands", origin: "overseas", process: "permanent", source: "directory" },
];

export const processes = [
  { id: "corrugate", label: "Corrugate" },
  { id: "print", label: "Print" },
  { id: "permanent", label: "Permanent fixture" },
];

export const leadTimeProfiles: LeadTimeProfile[] = [
  {
    id: "default",
    name: "Workspace default",
    scope: {},
    steps: { quote: w(5), structuralProof: w(10), printProof: w(10), production: w(20), shipPrep: w(2), transitAndSet: c(12) },
  },
  { id: "overseas", name: "Made overseas", scope: { origin: "overseas" }, steps: { production: w(30), transitAndSet: c(45) } },
  { id: "permanent", name: "Permanent fixtures", scope: { process: "permanent" }, steps: { structuralProof: w(15), production: w(30) } },
  { id: "print", name: "Print only", scope: { process: "print" }, steps: { production: w(10) } },
  { id: "harbor", name: "Harbor Display Co.", scope: { vendorId: "harbor" }, steps: { quote: w(3) } },
];

export interface Program {
  id: string;
  name: string;
  retailer: string;
  displayType: string;
  storeCount?: number;
  inStoreDate: ISODate;
  vendorId?: string;
  /** Actual completion dates. Use "all" for a finished program. */
  completed: Partial<Record<MilestoneKey, ISODate>> | "all";
  vendorState?: VendorState;
  backloggedUntil?: ISODate;
  verified?: boolean;
  /** Lead times changed for this program only. */
  leadTimeOverrides?: Partial<StepDurations>;
}

export const programs: Program[] = [
  {
    id: "holiday-gift-tower",
    name: "Holiday Gift Tower",
    retailer: "Northline Beauty",
    displayType: "Floor tower",
    storeCount: 180,
    inStoreDate: "2026-11-30",
    vendorId: "fieldhouse",
    completed: { submit: "2026-10-19", quoteApproved: "2026-10-26" },
    vendorState: "waitingOnYou",
    // A compressed holiday schedule agreed with the vendor.
    leadTimeOverrides: { structuralProof: w(14), printProof: w(2), production: w(5), shipPrep: w(1), transitAndSet: c(5) },
  },
  {
    id: "sun-care-floor-stand",
    name: "Sun Care Floor Stand",
    retailer: "Northline Beauty",
    displayType: "Floor stand",
    storeCount: 300,
    inStoreDate: "2027-03-15",
    vendorId: "kestrel",
    completed: { submit: "2026-10-05", quoteApproved: "2026-10-12", structuralProofApproved: "2026-10-21", printProofApproved: "2026-10-28" },
    vendorState: "backlogged",
    backloggedUntil: "2026-12-28",
  },
  {
    id: "spring-fragrance-endcap",
    name: "Spring Fragrance Endcap",
    retailer: "Northline Beauty",
    displayType: "Endcap",
    storeCount: 240,
    inStoreDate: "2027-02-08",
    vendorId: "harbor",
    completed: { submit: "2026-09-28", quoteApproved: "2026-10-01", structuralProofApproved: "2026-10-19", printProofApproved: "2026-11-02" },
    vendorState: "working",
  },
  {
    id: "fall-skincare-shelf-tray",
    name: "Fall Skincare Shelf Tray",
    retailer: "Northline Beauty",
    displayType: "Shelf tray",
    inStoreDate: "2027-06-01",
    completed: {},
  },
  {
    id: "counter-unit-refresh",
    name: "Counter Unit Refresh",
    retailer: "Northline Beauty",
    displayType: "Counter unit",
    storeCount: 120,
    inStoreDate: "2026-10-12",
    vendorId: "harbor",
    completed: "all",
    verified: true,
  },
];
