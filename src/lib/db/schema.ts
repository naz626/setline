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
  /** A Slack or Microsoft Teams incoming-webhook address that receives alerts. */
  alertWebhookUrl: text("alert_webhook_url"),
  /** Hash of the secret in the calendar feed address. The secret itself is shown once and never stored. */
  calendarTokenHash: text("calendar_token_hash"),
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
  /** Kinds of notification email this person has switched off. Everything is on by default. */
  mutedNotices: jsonb("muted_notices").$type<string[]>().notNull().default([]),
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
  /** The retailer's sign-off on the program, given by a retailer guest or recorded by the brand. */
  retailerApprovedAt: timestamp("retailer_approved_at", { withTimezone: true }),
  retailerApprovedBy: text("retailer_approved_by").references(() => users.id, { onDelete: "set null" }),
  retailerNote: text("retailer_note").notNull().default(""),
  /** True once the display is in store and confirmed. */
  verified: boolean("verified").notNull().default(false),
  /** Lead times changed for this program only. */
  leadTimeOverrides: jsonb("lead_time_overrides").$type<Partial<StepDurations>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("programs_workspace_idx").on(t.workspaceId)]);

/** Every status a vendor reports, newest last. The program row keeps the current one. */
export const vendorStatusEvents = pgTable("vendor_status_events", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  state: vendorStateEnum("state").notNull(),
  note: text("note").notNull().default(""),
  expectedStart: date("expected_start", { mode: "string" }).$type<ISODate>(),
  setBy: text("set_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("vendor_status_events_program_idx").on(t.programId)]);

export const proofKindEnum = pgEnum("proof_kind", ["quoteApproved", "structuralProofApproved", "printProofApproved"]);
export const proofDecisionEnum = pgEnum("proof_decision", ["approved", "changesRequested"]);

/**
 * One version of a quote or proof sent for approval. Files are links for now (see docs/build-brief.md, file storage);
 * source says where the version came from so an integration can add versions later.
 */
export const proofs = pgTable("proofs", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  kind: proofKindEnum("kind").notNull(),
  version: integer("version").notNull(),
  url: text("url").notNull(),
  note: text("note").notNull().default(""),
  source: text("source").notNull().default("link"),
  uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  decision: proofDecisionEnum("decision"),
  decisionNote: text("decision_note").notNull().default(""),
  decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  /** Set when a later change withdrew this version's approval, so the approval needs a new version. */
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("proofs_program_kind_version_idx").on(t.programId, t.kind, t.version)]);

export const proofComments = pgTable("proof_comments", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  proofId: text("proof_id").notNull().references(() => proofs.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [index("proof_comments_proof_idx").on(t.proofId)]);

export const guidelineTypeEnum = pgEnum("guideline_type", ["store", "brand", "vendor"]);

/** A guideline document. Store guidelines attach to programs by retailer name, vendor guidelines by vendor, brand guidelines to all. */
export const guidelines = pgTable("guidelines", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  type: guidelineTypeEnum("type").notNull(),
  title: text("title").notNull(),
  retailer: text("retailer").notNull().default(""),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  reviewBy: date("review_by", { mode: "string" }).$type<ISODate>(),
  createdAt: createdAt(),
}, (t) => [index("guidelines_workspace_idx").on(t.workspaceId)]);

export const guidelineVersions = pgTable("guideline_versions", {
  id: id(),
  guidelineId: text("guideline_id").notNull().references(() => guidelines.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("guideline_versions_guideline_idx").on(t.guidelineId)]);

/** One store in a program's rollout. Each date is filled in as the display moves along. */
export const programStores = pgTable("program_stores", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  storeNumber: text("store_number").notNull(),
  location: text("location").notNull().default(""),
  shippedOn: date("shipped_on", { mode: "string" }).$type<ISODate>(),
  deliveredOn: date("delivered_on", { mode: "string" }).$type<ISODate>(),
  installedOn: date("installed_on", { mode: "string" }).$type<ISODate>(),
  /** A photo of the display in the store: an upload reference or an https link. */
  photoUrl: text("photo_url"),
  photoAt: timestamp("photo_at", { withTimezone: true }),
  photoBy: text("photo_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("program_stores_program_number_idx").on(t.programId, t.storeNumber)]);

export const programFileKindEnum = pgEnum("program_file_kind", ["artwork", "specs", "quantities", "shipTo", "other"]);

/** A file the vendor needs for a program. Links for now, like proofs; source lets an integration add files later. */
export const programFiles = pgTable("program_files", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  kind: programFileKindEnum("kind").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull().default("link"),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("program_files_program_idx").on(t.programId)]);

/** What happened on a program, in plain words, newest last. Written by the services alongside each change. */
export const activityEvents = pgTable("activity_events", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  createdAt: createdAt(),
}, (t) => [index("activity_events_program_idx").on(t.programId)]);

export const changeCategoryEnum = pgEnum("change_category", ["artwork", "structure", "quantities", "stores", "dates", "other"]);

/**
 * A change to a program after it was submitted: what changed, which approvals it reopened,
 * and whether the vendor has confirmed they saw it. Changes can come at any point up to shipping.
 */
export const programChanges = pgTable("program_changes", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  category: changeCategoryEnum("category").notNull(),
  summary: text("summary").notNull(),
  reopened: jsonb("reopened").$type<ProofKind[]>().notNull().default([]),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  acknowledgedBy: text("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
}, (t) => [index("program_changes_program_idx").on(t.programId)]);

export type Role = (typeof roleEnum.enumValues)[number];
export type UserRow = typeof users.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type VendorRow = typeof vendors.$inferSelect;
export type LeadTimeProfileRow = typeof leadTimeProfiles.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
export type VendorStatusEventRow = typeof vendorStatusEvents.$inferSelect;
export type ProofRow = typeof proofs.$inferSelect;
export type ProofKind = (typeof proofKindEnum.enumValues)[number];
export type GuidelineRow = typeof guidelines.$inferSelect;
export type GuidelineType = (typeof guidelineTypeEnum.enumValues)[number];
export type ProgramStoreRow = typeof programStores.$inferSelect;
export type ProgramFileRow = typeof programFiles.$inferSelect;
export type ProgramFileKind = (typeof programFileKindEnum.enumValues)[number];
export type ProgramChangeRow = typeof programChanges.$inferSelect;
export type ChangeCategory = (typeof changeCategoryEnum.enumValues)[number];
