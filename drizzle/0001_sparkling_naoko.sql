CREATE TYPE "public"."guideline_type" AS ENUM('store', 'brand', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."proof_decision" AS ENUM('approved', 'changesRequested');--> statement-breakpoint
CREATE TYPE "public"."proof_kind" AS ENUM('quoteApproved', 'structuralProofApproved', 'printProofApproved');--> statement-breakpoint
CREATE TABLE "guideline_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"guideline_id" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guidelines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" "guideline_type" NOT NULL,
	"title" text NOT NULL,
	"retailer" text DEFAULT '' NOT NULL,
	"vendor_id" text,
	"review_by" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_stores" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"program_id" text NOT NULL,
	"store_number" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"shipped_on" date,
	"delivered_on" date,
	"installed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"proof_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"program_id" text NOT NULL,
	"kind" "proof_kind" NOT NULL,
	"version" integer NOT NULL,
	"url" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'link' NOT NULL,
	"uploaded_by" text,
	"decision" "proof_decision",
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_status_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"program_id" text NOT NULL,
	"state" "vendor_state" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"expected_start" date,
	"set_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guideline_versions" ADD CONSTRAINT "guideline_versions_guideline_id_guidelines_id_fk" FOREIGN KEY ("guideline_id") REFERENCES "public"."guidelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_versions" ADD CONSTRAINT "guideline_versions_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_stores" ADD CONSTRAINT "program_stores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_stores" ADD CONSTRAINT "program_stores_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_proof_id_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proofs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_status_events" ADD CONSTRAINT "vendor_status_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_status_events" ADD CONSTRAINT "vendor_status_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_status_events" ADD CONSTRAINT "vendor_status_events_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guideline_versions_guideline_idx" ON "guideline_versions" USING btree ("guideline_id");--> statement-breakpoint
CREATE INDEX "guidelines_workspace_idx" ON "guidelines" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_stores_program_number_idx" ON "program_stores" USING btree ("program_id","store_number");--> statement-breakpoint
CREATE INDEX "proof_comments_proof_idx" ON "proof_comments" USING btree ("proof_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proofs_program_kind_version_idx" ON "proofs" USING btree ("program_id","kind","version");--> statement-breakpoint
CREATE INDEX "vendor_status_events_program_idx" ON "vendor_status_events" USING btree ("program_id");