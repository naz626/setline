ALTER TABLE "memberships" ADD COLUMN "muted_notices" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "program_stores" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "program_stores" ADD COLUMN "photo_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program_stores" ADD COLUMN "photo_by" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "retailer_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "retailer_approved_by" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "retailer_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "alert_webhook_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "calendar_token_hash" text;--> statement-breakpoint
ALTER TABLE "program_stores" ADD CONSTRAINT "program_stores_photo_by_users_id_fk" FOREIGN KEY ("photo_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_retailer_approved_by_users_id_fk" FOREIGN KEY ("retailer_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;