import { addDays, addWorkingDays, maxDate, snapToWorkingDay, workingDaysBetween } from "./dates";
import type { ISODate } from "./dates";
import { MILESTONES, STEPS } from "./types";
import type { Duration, Health, MilestoneKey, Schedule, ScheduleOptions, Stage, StepKey, VendorState } from "./types";

type Durations = Record<StepKey, Duration>;

function shift(date: ISODate, duration: Duration, direction: -1 | 1, options: ScheduleOptions): ISODate {
  const moved =
    duration.unit === "working"
      ? addWorkingDays(date, direction * duration.days, options.holidays)
      : addDays(date, direction * duration.days);
  if (options.keepOnWorkingDays === false) return moved;
  // Going backward we snap earlier so there is never less time than the lead time allows; going forward we snap later.
  return snapToWorkingDay(moved, direction, options.holidays);
}

/** Counts every key date back from the in-store date. The in-store date itself is never moved. */
export function scheduleBackward(inStoreDate: ISODate, durations: Durations, options: ScheduleOptions = {}): Schedule {
  const schedule = { inStore: inStoreDate } as Schedule;
  for (let i = STEPS.length - 1; i >= 0; i--) {
    schedule[MILESTONES[i]] = shift(schedule[MILESTONES[i + 1]], durations[STEPS[i]], -1, options);
  }
  return schedule;
}

export interface ProgressInput {
  planned: Schedule;
  durations: Durations;
  /** Actual completion dates for the milestones that are done. */
  completed: Partial<Record<MilestoneKey, ISODate>>;
  today: ISODate;
  /** When the vendor is backlogged, the date they expect to be able to start or resume. */
  backloggedUntil?: ISODate;
  options?: ScheduleOptions;
}

/**
 * Projects the remaining dates forward from what has actually happened.
 * A milestone can never be projected earlier than its planned date, and unfinished work can never finish in the past.
 * A vendor backlog delays the next vendor-side step until the vendor can start.
 */
export function projectForward(input: ProgressInput): Schedule {
  const { planned, durations, completed, today, backloggedUntil, options = {} } = input;
  const projected = {} as Schedule;
  let previous: ISODate | undefined;
  let backlogApplied = false;

  MILESTONES.forEach((key, index) => {
    const done = completed[key];
    if (done) {
      projected[key] = done;
      // A reopened earlier date (an approval sent back after later steps were done) still holds up what remains.
      previous = previous ? maxDate(previous, done) : done;
      return;
    }
    let earliest = maxDate(planned[key], today);
    if (index > 0 && previous) {
      const step = STEPS[index - 1];
      let start = previous;
      const vendorStep = step === "production" || step === "shipPrep";
      if (backloggedUntil && !backlogApplied && vendorStep) {
        start = maxDate(start, backloggedUntil);
        backlogApplied = true;
      }
      // Only chain from the previous date when that date is itself late; otherwise the plan already holds.
      if (start > planned[MILESTONES[index - 1]]) {
        earliest = maxDate(earliest, shift(start, durations[step], 1, options));
      }
    }
    projected[key] = earliest;
    previous = earliest;
  });
  return projected;
}

export interface HealthInput {
  planned: Schedule;
  projected: Schedule;
  completed: Partial<Record<MilestoneKey, ISODate>>;
  today: ISODate;
  hasVendor: boolean;
  /** True once the display is in store and verified. */
  verified?: boolean;
  /** True when a brand approval is past its due date. */
  approvalOverdue?: boolean;
  holidays?: ReadonlySet<ISODate>;
}

/** How close to its due date an unfinished milestone can get before the program is flagged. */
export const AT_RISK_WINDOW_WORKING_DAYS = 3;

export function computeHealth(input: HealthInput): Health {
  const { planned, projected, completed, today, hasVendor, verified, approvalOverdue, holidays } = input;
  if (verified) return "complete";
  if (!hasVendor) return "notStarted";
  if (projected.inStore > planned.inStore) return "willMiss";
  if (approvalOverdue) return "atRisk";
  const next = nextMilestone(completed);
  if (next && next !== "inStore") {
    const remaining = workingDaysBetween(today, planned[next], holidays);
    if (remaining <= AT_RISK_WINDOW_WORKING_DAYS) return "atRisk";
  }
  return "onTrack";
}

export function nextMilestone(completed: Partial<Record<MilestoneKey, ISODate>>): MilestoneKey | undefined {
  return MILESTONES.find((key) => !completed[key]);
}

export function computeStage(completed: Partial<Record<MilestoneKey, ISODate>>): Stage {
  if (completed.inStore) return "inStore";
  if (completed.productionComplete) return "ship";
  if (completed.printProofApproved) return "produce";
  if (completed.quoteApproved) return "approve";
  if (completed.submit) return "submit";
  return "plan";
}

/** An overdue brand approval means the vendor is waiting on the brand, whatever they last reported. */
export function effectiveVendorState(reported: VendorState | undefined, approvalOverdue: boolean): VendorState | undefined {
  if (!reported) return undefined;
  return approvalOverdue && reported === "working" ? "waitingOnYou" : reported;
}
