CREATE TYPE "public"."change_category" AS ENUM('artwork', 'structure', 'quantities', 'stores', 'dates', 'other');--> statement-breakpoint
CREATE TABLE "program_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"program_id" text NOT NULL,
	"category" "change_category" NOT NULL,
	"summary" text NOT NULL,
	"reopened" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "proofs" ADD COLUMN "reopened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program_changes" ADD CONSTRAINT "program_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_changes" ADD CONSTRAINT "program_changes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_changes" ADD CONSTRAINT "program_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_changes" ADD CONSTRAINT "program_changes_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_changes_program_idx" ON "program_changes" USING btree ("program_id");