CREATE TYPE "public"."line_item_pricing_model" AS ENUM('deterministic', 'judgment');--> statement-breakpoint
CREATE TABLE "tenant_line_item_types" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"pricing_model" "line_item_pricing_model" DEFAULT 'judgment' NOT NULL,
	"default_rate_type" varchar(32),
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_line_item_types" ADD CONSTRAINT "tenant_line_item_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_line_item_types_tenant_key_uq" ON "tenant_line_item_types" USING btree ("tenant_id","key");