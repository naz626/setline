import {
  MILESTONE_OWNER,
  computeHealth,
  computeStage,
  effectiveVendorState,
  nextMilestone,
  projectForward,
  resolveLeadTimes,
  scheduleBackward,
} from "@/lib/timeline";
import type { Health, ISODate, MilestoneKey, ResolvedLeadTimes, Schedule, Stage, VendorState } from "@/lib/timeline";
import { DEMO_TODAY, leadTimeProfiles, programs, vendors } from "./seed";
import type { Program, Vendor } from "./seed";

export interface ProgramView {
  program: Program;
  vendor?: Vendor;
  leadTimes: ResolvedLeadTimes;
  planned: Schedule;
  projected: Schedule;
  completed: Partial<Record<MilestoneKey, ISODate>>;
  next?: MilestoneKey;
  stage: Stage;
  health: Health;
  vendorState?: VendorState;
  approvalOverdue: boolean;
  today: ISODate;
}

export function getToday(): ISODate {
  return DEMO_TODAY;
}

export function buildProgramView(program: Program, today: ISODate = getToday()): ProgramView {
  const vendor = vendors.find((v) => v.id === program.vendorId);
  const leadTimes = resolveLeadTimes(
    leadTimeProfiles,
    { vendorId: vendor?.id, origin: vendor?.origin, process: vendor?.process, displayType: program.displayType },
    program.leadTimeOverrides,
  );
  const planned = scheduleBackward(program.inStoreDate, leadTimes);
  const completed = program.completed === "all" ? { ...planned } : program.completed;
  const projected = projectForward({ planned, durations: leadTimes, completed, today, backloggedUntil: program.backloggedUntil });
  const next = nextMilestone(completed);
  const approvalOverdue = Boolean(vendor && next && MILESTONE_OWNER[next] === "brand" && next !== "submit" && planned[next] < today);
  return {
    program,
    vendor,
    leadTimes,
    planned,
    projected,
    completed,
    next,
    stage: computeStage(completed),
    health: computeHealth({ planned, projected, completed, today, hasVendor: Boolean(vendor), verified: program.verified, approvalOverdue }),
    vendorState: effectiveVendorState(program.vendorState, approvalOverdue),
    approvalOverdue,
    today,
  };
}

const HEALTH_ORDER: Health[] = ["willMiss", "atRisk", "onTrack", "notStarted", "complete"];

/** All programs, most urgent first. */
export function listProgramViews(): ProgramView[] {
  return programs
    .map((p) => buildProgramView(p))
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.program.inStoreDate.localeCompare(b.program.inStoreDate));
}

export function getProgramView(id: string): ProgramView | undefined {
  const program = programs.find((p) => p.id === id);
  return program ? buildProgramView(program) : undefined;
}
