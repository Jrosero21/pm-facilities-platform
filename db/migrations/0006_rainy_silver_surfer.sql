CREATE TABLE "tenant_invoice_sequences" (
	"tenant_id" varchar(36) PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "legal_name" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address_line1" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address_line2" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city" varchar(128);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "state_province" varchar(128);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "postal_code" varchar(32);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "country" varchar(2);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "remit_to" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "phone" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "tenant_invoice_sequences" ADD CONSTRAINT "tenant_invoice_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;