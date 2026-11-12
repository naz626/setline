import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ISODate, MilestoneKey, StepDurations } from "@/lib/timeline";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["brandAdmin", "programManager", "designer", "reviewer", "vendorGuest", "retailerGuest"]);
export const originEnum = pgEnum("origin", ["domestic", "overseas"]);
export const vendorStateEnum = pgEnum("vendor_state", ["working", "waitingOnYou", "backlogged"]);
export const vendorSourceEnum = pgEnum("vendor_source", ["added", "directory"]);

export const users = pgTable("users", {
  id: id(),
  /** Always stored lower-case. */
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: createdAt(),
});

/** One-time sign-in links. Only a hash of the token is stored. */
export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("login_tokens_email_idx").on(t.email)]);

/** Signed-in sessions. Only a hash of the cookie value is stored. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  /** IANA time zone used to decide what "today" is for deadlines. */
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: createdAt(),
});

export const vendors = pgTable("vendors", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  makes: text("makes").notNull().default(""),
  origin: originEnum("origin").notNull().default("domestic"),
  process: text("process").notNull(),
  source: vendorSourceEnum("source").notNull().default("added"),
  createdAt: createdAt(),
}, (t) => [index("vendors_workspace_idx").on(t.workspaceId)]);

export const memberships = pgTable("memberships", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  /** Set for vendor guests: the one vendor whose programs they can see. */
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("memberships_workspace_user_idx").on(t.workspaceId, t.userId)]);

export const invitations = pgTable("invitations", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invitations_workspace_email_idx").on(t.workspaceId, t.email)]);

/**
 * Lead times for the programs a profile applies to. All scope columns empty means the workspace default.
 * See resolveLeadTimes in src/lib/timeline for how profiles are layered.
 */
export const leadTimeProfiles = pgTable("lead_time_profiles", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  origin: originEnum("origin"),
  process: text("process"),
  displayType: text("display_type"),
  steps: jsonb("steps").$type<Partial<StepDurations>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("lead_time_profiles_workspace_idx").on(t.workspaceId)]);

export const programs = pgTable("programs", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  retailer: text("retailer").notNull().default(""),
  displayType: text("display_type").notNull(),
  storeCount: integer("store_count"),
  inStoreDate: date("in_store_date", { mode: "string" }).notNull().$type<ISODate>(),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  /** Actual completion date per milestone. Will move to its own table when approvals are built. */
  completed: jsonb("completed").$type<Partial<Record<MilestoneKey, ISODate>>>().notNull().default({}),
  vendorState: vendorStateEnum("vendor_state"),
  backloggedUntil: date("backlogged_until", { mode: "string" }).$type<ISODate>(),
  /** True once the display is in store and confirmed. */
  verified: boolean("verified").notNull().default(false),
  /** Lead times changed for this program only. */
  leadTimeOverrides: jsonb("lead_time_overrides").$type<Partial<StepDurations>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("programs_workspace_idx").on(t.workspaceId)]);

export type Role = (typeof roleEnum.enumValues)[number];
export type UserRow = typeof users.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type VendorRow = typeof vendors.$inferSelect;
export type LeadTimeProfileRow = typeof leadTimeProfiles.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
