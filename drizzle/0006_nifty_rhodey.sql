ALTER TABLE "invitations" ADD COLUMN "retailer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "retailer" text DEFAULT '' NOT NULL;