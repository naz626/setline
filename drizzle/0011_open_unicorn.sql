ALTER TABLE "workspaces" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_stripe_customer_idx" ON "workspaces" USING btree ("stripe_customer_id");