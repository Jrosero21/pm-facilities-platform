CREATE TYPE "public"."agent_quality_tier" AS ENUM('tier1', 'tier3', 'tier4');--> statement-breakpoint
CREATE TABLE "agent_quality_floors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tier" "agent_quality_tier" NOT NULL,
	"min_confidence" "agents_substrate_confidence" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aqf_tier_unique" ON "agent_quality_floors" USING btree ("tier");