import type { Role } from "@/lib/db/schema";

/** What each role may do. Checked on the server for every change; the UI only hides what would be refused. */
export const PERMISSIONS = {
  "workspace.manage": ["brandAdmin"],
  "members.invite": ["brandAdmin"],
  "leadTimes.edit": ["brandAdmin", "programManager"],
  "vendors.manage": ["brandAdmin", "programManager"],
  "programs.create": ["brandAdmin", "programManager"],
  "programs.editSchedule": ["brandAdmin", "programManager"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: Role, action: Action): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Your role does not allow this (${action}).`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(action);
}

export const ROLE_LABELS: Record<Role, string> = {
  brandAdmin: "Brand admin",
  programManager: "Program manager",
  designer: "Designer",
  reviewer: "Reviewer",
  vendorGuest: "Vendor guest",
  retailerGuest: "Retailer guest",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  brandAdmin: "Everything, including members, vendors and lead times",
  programManager: "Create programs, set dates and lead times",
  designer: "View programs and timelines",
  reviewer: "View programs and timelines",
  vendorGuest: "See only the programs assigned to their vendor",
  retailerGuest: "View program status and in-store dates",
};

/** Roles that belong to the brand's own team and see every program in the workspace. */
export function isBrandRole(role: Role): boolean {
  return role !== "vendorGuest" && role !== "retailerGuest";
}
