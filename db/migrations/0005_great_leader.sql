ALTER TABLE "clients" ADD COLUMN "autonomy_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "must_notify_client" boolean DEFAULT false NOT NULL;