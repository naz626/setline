import type { Role } from "@/lib/db/schema";

/** What each role may do. Checked on the server for every change; the UI only hides what would be refused. */
export const PERMISSIONS = {
  "workspace.manage": ["brandAdmin"],
  "workspace.view": ["brandAdmin", "programManager", "designer", "reviewer"],
  "members.invite": ["brandAdmin"],
  "leadTimes.edit": ["brandAdmin", "programManager"],
  "vendors.manage": ["brandAdmin", "programManager"],
  "programs.create": ["brandAdmin", "programManager"],
  "programs.editSchedule": ["brandAdmin", "programManager"],
  "vendorStatus.set": ["brandAdmin", "programManager", "vendorGuest"],
  /** Production complete and shipped belong to the vendor, so their guests may mark them. */
  "vendorMilestones.complete": ["brandAdmin", "programManager", "vendorGuest"],
  /** Proofs are working files between the brand and its vendor. Retailer guests see program status, not these. */
  "proofs.view": ["brandAdmin", "programManager", "designer", "reviewer", "vendorGuest"],
  "proofs.submit": ["brandAdmin", "programManager", "designer", "vendorGuest"],
  "proofs.decide": ["brandAdmin", "programManager", "reviewer"],
  "proofs.comment": ["brandAdmin", "programManager", "designer", "reviewer", "vendorGuest"],
  "changes.log": ["brandAdmin", "programManager", "designer"],
  /** Confirming a change was seen: the vendor's contact, or the brand on their behalf. */
  "changes.acknowledge": ["brandAdmin", "programManager", "vendorGuest"],
  /** Putting a file into storage. What it can be attached to is checked separately. */
  "files.upload": ["brandAdmin", "programManager", "designer", "reviewer", "vendorGuest", "retailerGuest"],
  "files.manage": ["brandAdmin", "programManager", "designer"],
  "guidelines.edit": ["brandAdmin", "programManager", "designer"],
  "stores.manage": ["brandAdmin", "programManager"],
  /** Adding the photo that confirms a display is set up in a store. */
  "stores.photo": ["brandAdmin", "programManager", "vendorGuest", "retailerGuest"],
  /** The retailer's sign-off: the retailer's own guest, or the brand recording it for them. */
  "retailer.signoff": ["brandAdmin", "programManager", "retailerGuest"],
  "integrations.manage": ["brandAdmin"],
  "stores.update": ["brandAdmin", "programManager", "vendorGuest"],
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
  designer: "Send proofs, comment and edit guidelines",
  reviewer: "View, comment and approve proofs",
  vendorGuest: "Update status and send proofs for their vendor's programs only",
  retailerGuest: "View program status and in-store dates",
};

/** Roles that belong to the brand's own team and see every program in the workspace. */
export function isBrandRole(role: Role): boolean {
  return role !== "vendorGuest" && role !== "retailerGuest";
}

/** Stops guests from reading workspace-wide lists such as members, vendors and lead times. */
export function assertBrand(role: Role): void {
  if (!isBrandRole(role)) throw new ForbiddenError("workspace.view");
}
