CREATE TABLE "vendor_followup_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"draft_content" text NOT NULL,
	"status" "agent_draft_status" DEFAULT 'pending_review' NOT NULL,
	"sent_dispatch_message_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_followup_drafts" ADD CONSTRAINT "vfd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followup_drafts" ADD CONSTRAINT "vfd_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followup_drafts" ADD CONSTRAINT "vfd_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_followup_drafts" ADD CONSTRAINT "vfd_sent_msg_fk" FOREIGN KEY ("sent_dispatch_message_id") REFERENCES "public"."dispatch_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vfd_tenant_assignment_idx" ON "vendor_followup_drafts" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "vfd_tenant_status_idx" ON "vendor_followup_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "vfd_run_idx" ON "vendor_followup_drafts" USING btree ("agent_run_id");