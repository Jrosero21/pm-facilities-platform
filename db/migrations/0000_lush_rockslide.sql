CREATE TYPE "public"."agent_draft_status" AS ENUM('pending_review', 'approved', 'rejected', 'discarded', 'published');--> statement-breakpoint
CREATE TYPE "public"."agent_review_decision" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_tool_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."agents_rewriter_source_type" AS ENUM('job_note', 'vendor_update');--> statement-breakpoint
CREATE TYPE "public"."agents_substrate_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."agents_substrate_disposition" AS ENUM('queued_for_review', 'auto_executed', 'policy_blocked');--> statement-breakpoint
CREATE TYPE "public"."agents_substrate_tool_kind" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."billing_model" AS ENUM('rate_sheet', 'cost_plus', 'flat');--> statement-breakpoint
CREATE TYPE "public"."change_order_status" AS ENUM('draft', 'submitted', 'approved', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('internal_note', 'vendor_portal', 'client_portal', 'email', 'sms', 'external_portal', 'phone_call');--> statement-breakpoint
CREATE TYPE "public"."client_details_day_of_week" AS ENUM('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat');--> statement-breakpoint
CREATE TYPE "public"."client_invoice_status" AS ENUM('draft', 'sent', 'void');--> statement-breakpoint
CREATE TYPE "public"."comm_visibility" AS ENUM('internal_only', 'vendor_visible', 'client_visible', 'client_and_vendor_visible', 'requires_review');--> statement-breakpoint
CREATE TYPE "public"."communications_direction" AS ENUM('outbound', 'inbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('ok', 'no_data', 'expired', 'non_compliant');--> statement-breakpoint
CREATE TYPE "public"."config_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('active', 'inactive', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'queued', 'sent', 'delivered', 'failed', 'bounced', 'received');--> statement-breakpoint
CREATE TYPE "public"."dispatch_comms_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."dispatch_reference_category" AS ENUM('draft', 'pending', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('staged', 'spawned', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending_review', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."email_source_type" AS ENUM('email_ingestion', 'forwarded_email');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('declared', 'dispatching', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('day', 'week', 'month');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('generated', 'skipped', 'pending_review');--> statement-breakpoint
CREATE TYPE "public"."geo_match_type" AS ENUM('postal_code', 'city', 'state', 'national');--> statement-breakpoint
CREATE TYPE "public"."io_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."job_details_attachment_type" AS ENUM('photo', 'document', 'signature', 'invoice', 'quote', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_reference_category" AS ENUM('open', 'in_progress', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."jobs_follow_up_category" AS ENUM('vendor_followup', 'confirm_onsite', 'proposal_followup', 'general');--> statement-breakpoint
CREATE TYPE "public"."jobs_source_type" AS ENUM('manual', 'internal_client_portal', 'external_client_portal', 'email_ingestion', 'forwarded_email', 'api', 'preventative_maintenance', 'snow_event');--> statement-breakpoint
CREATE TYPE "public"."line_item_category" AS ENUM('labor', 'materials', 'equipment', 'trip', 'permit', 'fee', 'tax', 'other');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('active', 'unlinked');--> statement-breakpoint
CREATE TYPE "public"."llm_key_provider" AS ENUM('anthropic', 'openai');--> statement-breakpoint
CREATE TYPE "public"."llm_key_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."mapping_direction" AS ENUM('inbound', 'outbound', 'both');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."nte_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('ok', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "public"."parse_outcome" AS ENUM('parsed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."parser_kind" AS ENUM('deterministic', 'ai_assist');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."portal_updates_queue_status" AS ENUM('queued', 'processing', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."portal_updates_target_portal" AS ENUM('client_portal', 'vendor_portal', 'external_portal');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('received', 'parsed', 'drafted', 'failed', 'duplicate_flagged');--> statement-breakpoint
CREATE TYPE "public"."proposal_kind" AS ENUM('client', 'internal');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded', 'withdrawn', 'internal_billed');--> statement-breakpoint
CREATE TYPE "public"."rate_type" AS ENUM('hourly', 'flat', 'trip_charge', 'per_unit', 'emergency', 'after_hours');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('vendor_contact', 'client_contact', 'external', 'internal', 'none');--> statement-breakpoint
CREATE TYPE "public"."result" AS ENUM('done', 'skipped', 'na');--> statement-breakpoint
CREATE TYPE "public"."roles_scope" AS ENUM('global', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('dispatch_message', 'outbound_message', 'inbound_message', 'job_note', 'client_update', 'vendor_update');--> statement-breakpoint
CREATE TYPE "public"."step_source" AS ENUM('ai_generated', 'template', 'manual', 'edited');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tenants_type" AS ENUM('aggregator', 'vendor', 'client');--> statement-breakpoint
CREATE TYPE "public"."value_source" AS ENUM('client_provided', 'system_default', 'looked_up');--> statement-breakpoint
CREATE TYPE "public"."vendor_coverage_area_type" AS ENUM('radius', 'postal_code', 'city', 'county', 'state', 'national');--> statement-breakpoint
CREATE TYPE "public"."vendor_details_compliance_status" AS ENUM('pending', 'compliant', 'non_compliant', 'expired');--> statement-breakpoint
CREATE TYPE "public"."vendor_details_document_type" AS ENUM('insurance', 'w9', 'license', 'certification', 'agreement', 'other');--> statement-breakpoint
CREATE TYPE "public"."vendor_details_requirement_type" AS ENUM('general_liability', 'workers_comp', 'auto_liability', 'umbrella', 'background_check', 'license', 'certification', 'other');--> statement-breakpoint
CREATE TYPE "public"."vendor_invoice_source_type" AS ENUM('manual', 'vendor_portal', 'email_ingestion', 'external_portal_sync', 'api');--> statement-breakpoint
CREATE TYPE "public"."vendor_invoice_status" AS ENUM('received', 'under_review', 'approved', 'disputed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."vendors_vendor_type" AS ENUM('local', 'regional', 'national');--> statement-breakpoint
CREATE TABLE "agent_policies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36),
	"agent_id" varchar(64) NOT NULL,
	"policy" json NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_policy_defaults" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"policy" json NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_template_defaults" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"variant" varchar(64) DEFAULT 'default' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text,
	"model_hint" varchar(64),
	"temperature" numeric(3, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"variant" varchar(64) DEFAULT 'default' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text,
	"model_hint" varchar(64),
	"temperature" numeric(3, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"vendor_invoice_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"proposed_invoice" json NOT NULL,
	"status" "agent_draft_status" DEFAULT 'pending_review' NOT NULL,
	"published_client_invoice_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_reviews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"draft_id" varchar(36) NOT NULL,
	"reviewer_user_id" varchar(36),
	"decision" "agent_review_decision" NOT NULL,
	"edited_content" json,
	"review_notes" text,
	"reviewed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"proposed_proposal" json NOT NULL,
	"status" "agent_draft_status" DEFAULT 'pending_review' NOT NULL,
	"published_proposal_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_reviews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"proposal_draft_id" varchar(36) NOT NULL,
	"reviewer_user_id" varchar(36),
	"decision" "agent_review_decision" NOT NULL,
	"edited_content" json,
	"review_notes" text,
	"reviewed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "update_rewrite_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"source_type" "agents_rewriter_source_type" DEFAULT 'job_note' NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"draft_content" text NOT NULL,
	"status" "agent_draft_status" DEFAULT 'pending_review' NOT NULL,
	"published_communication_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "update_rewrite_reviews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"draft_id" varchar(36) NOT NULL,
	"reviewer_user_id" varchar(36),
	"decision" "agent_review_decision" NOT NULL,
	"edited_content" text,
	"review_notes" text,
	"reviewed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_decisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"decision_type" varchar(64) NOT NULL,
	"proposed_action" varchar(500),
	"reasoning" text,
	"confidence" "agents_substrate_confidence",
	"policy_check" varchar(128),
	"disposition" "agents_substrate_disposition" NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"trigger_source" varchar(32) DEFAULT 'operator_manual' NOT NULL,
	"triggered_by_user_id" varchar(36),
	"job_id" varchar(36),
	"input_summary" varchar(500),
	"output_summary" varchar(500),
	"model" varchar(64),
	"prompt_version" varchar(64),
	"input_tokens" integer,
	"output_tokens" integer,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"sequence" integer NOT NULL,
	"tool_name" varchar(128) NOT NULL,
	"tool_kind" "agents_substrate_tool_kind" NOT NULL,
	"tool_input" json,
	"tool_output" json,
	"status" "agent_tool_status" DEFAULT 'ok' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"user_id" varchar(36),
	"actor_label" varchar(128),
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(36),
	"metadata" json,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" varchar(255) NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_autonomy_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"max_committed_per_job" numeric(12, 2),
	"max_committed_per_day" numeric(12, 2),
	"max_committed_per_tenant" numeric(12, 2),
	"max_llm_tokens_per_day" integer,
	"max_llm_tokens_per_tenant" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_nte_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"priority_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36),
	"nte_amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "nte_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_billing_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_user_id" varchar(36),
	"summary" varchar(500) NOT NULL,
	"amount" numeric(12, 2),
	"currency" varchar(3),
	"proposal_id" varchar(36),
	"change_order_id" varchar(36),
	"vendor_invoice_id" varchar(36),
	"client_invoice_id" varchar(36),
	"payment_id" varchar(36),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_order_approvals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"change_order_id" varchar(36) NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"approver_user_id" varchar(36),
	"approver_name" varchar(255),
	"decided_at" timestamp NOT NULL,
	"notes" text,
	"signature_ref" varchar(1024),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_order_line_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"line_number" integer NOT NULL,
	"category" "line_item_category" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(32),
	"unit_price" numeric(12, 2) NOT NULL,
	"extended_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 3),
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"markup_percent" numeric(6, 3),
	"markup_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trade_id" varchar(36),
	"rate_type" "rate_type",
	"change_order_id" varchar(36) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"proposal_id" varchar(36),
	"status" "change_order_status" DEFAULT 'draft' NOT NULL,
	"scope_delta_snapshot" text,
	"reason" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"markup_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_billing_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"markup_percent" numeric(6, 3),
	"payment_terms_days" integer,
	"is_tax_exempt" boolean DEFAULT false NOT NULL,
	"emergency_nte_multiplier" numeric(4, 2),
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"title" varchar(128),
	"email" varchar(255),
	"phone" varchar(32),
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_location_access_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"title" varchar(128),
	"body" text NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_location_contacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"title" varchar(128),
	"email" varchar(255),
	"phone" varchar(32),
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_location_hours" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"day_of_week" "client_details_day_of_week" NOT NULL,
	"open_time" time,
	"close_time" time,
	"is_closed" boolean DEFAULT false NOT NULL,
	"notes" varchar(255),
	"hours_source" "value_source" DEFAULT 'system_default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_rates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"trade_id" varchar(36),
	"rate_type" "rate_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"unit" varchar(32),
	"effective_date" date,
	"expiry_date" date,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invoice_line_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"line_number" integer NOT NULL,
	"category" "line_item_category" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(32),
	"unit_price" numeric(12, 2) NOT NULL,
	"extended_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 3),
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"markup_percent" numeric(6, 3),
	"markup_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trade_id" varchar(36),
	"rate_type" "rate_type",
	"client_invoice_id" varchar(36) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"invoice_number" varchar(128),
	"sequence_number" integer,
	"is_final" boolean DEFAULT false NOT NULL,
	"status" "client_invoice_status" DEFAULT 'draft' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"markup_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_terms_days" integer,
	"issued_at" timestamp,
	"due_at" timestamp,
	"issued_by_user_id" varchar(36),
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_update_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"source_draft_id" varchar(36),
	"created_by_user_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_locations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_code" varchar(64),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"address_line1" varchar(255) NOT NULL,
	"address_line2" varchar(255),
	"city" varchar(128) NOT NULL,
	"state_province" varchar(128) NOT NULL,
	"postal_code" varchar(32) NOT NULL,
	"country" varchar(2) DEFAULT 'US' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"timezone" varchar(64),
	"timezone_source" "value_source" DEFAULT 'system_default' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"client_code" varchar(64),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"billing_model" "billing_model" DEFAULT 'cost_plus' NOT NULL,
	"require_vendor_invoice_for_cost_plus" boolean DEFAULT false NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"channel" "channel" NOT NULL,
	"direction" "communications_direction" NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"visibility" "comm_visibility" DEFAULT 'internal_only' NOT NULL,
	"summary" varchar(500) NOT NULL,
	"sent_by_user_id" varchar(36),
	"recipient_type" "recipient_type" DEFAULT 'none' NOT NULL,
	"recipient_id" varchar(36),
	"recipient_email" varchar(255),
	"recipient_phone" varchar(32),
	"cc" text,
	"bcc" text,
	"delivery_status" "delivery_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"provider_message_id" varchar(255),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject_template" varchar(500),
	"body_template" text NOT NULL,
	"applicable_channels" json NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_sender" varchar(255),
	"subject" varchar(255),
	"raw_body" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"parse_status" varchar(32) DEFAULT 'unparsed' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"template_id" varchar(36),
	"created_by_user_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_vendor_assignment_status_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"from_status_id" varchar(36),
	"to_status_id" varchar(36) NOT NULL,
	"changed_by_user_id" varchar(36),
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_vendor_assignments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"vendor_location_id" varchar(36),
	"vendor_contact_id" varchar(36),
	"current_status_id" varchar(36) NOT NULL,
	"agreed_nte_amount" numeric(12, 2),
	"scheduled_start_at" timestamp,
	"scheduled_end_at" timestamp,
	"dispatch_scope" text,
	"matched_trade_id" varchar(36) NOT NULL,
	"matched_trade_was_primary" boolean NOT NULL,
	"tightest_geo_at_dispatch" "geo_match_type" NOT NULL,
	"matched_geo_types_at_dispatch" json NOT NULL,
	"compliance_status_at_dispatch" "compliance_status" NOT NULL,
	"chosen_branch_covered_trade" boolean,
	"sent_at" timestamp,
	"created_by_user_id" varchar(36),
	"replaces_assignment_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"direction" "dispatch_comms_direction" DEFAULT 'outbound' NOT NULL,
	"message_type" varchar(64) NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"visibility" "comm_visibility" DEFAULT 'internal_only' NOT NULL,
	"sent_by_user_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_check_ins" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"note" varchar(500),
	"recorded_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_check_outs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"note" varchar(500),
	"recorded_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_eta_confirmations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"eta_start_at" timestamp NOT NULL,
	"eta_end_at" timestamp,
	"note" varchar(500),
	"confirmed_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_assignment_statuses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	"code" varchar(32) NOT NULL,
	"category" "dispatch_reference_category" NOT NULL,
	"sort_order" integer NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_blocked_vendors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36),
	"vendor_id" varchar(36) NOT NULL,
	"reason" varchar(500),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_preferred_vendors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"priority" integer NOT NULL,
	"notes" varchar(500),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"inbound_email_id" varchar(36) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(255),
	"size_bytes" integer,
	"storage_ref" varchar(512),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_ingestion_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"intake_address" varchar(255) NOT NULL,
	"source_type" "email_source_type" NOT NULL,
	"expected_parser_rule_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_parse_results" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"inbound_email_id" varchar(36) NOT NULL,
	"parser_kind" "parser_kind" NOT NULL,
	"matched_format" varchar(128),
	"matched_rule_id" varchar(36),
	"confidence" numeric(5, 4),
	"extracted_fields" json,
	"extracted_client_code" varchar(64),
	"parse_outcome" "parse_outcome" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_parser_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"match_sender_pattern" varchar(255),
	"format_key" varchar(128) NOT NULL,
	"extraction_config" json,
	"direction" varchar(32),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_work_order_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"inbound_email_id" varchar(36) NOT NULL,
	"parse_result_id" varchar(36),
	"draft_status" "draft_status" DEFAULT 'pending_review' NOT NULL,
	"source_type" "email_source_type" NOT NULL,
	"problem_description" text,
	"resolved_client_id" varchar(36),
	"resolved_client_location_id" varchar(36),
	"resolved_trade_id" varchar(36),
	"resolved_priority_id" varchar(36),
	"created_job_id" varchar(36),
	"reviewed_by_user_id" varchar(36),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"ingestion_account_id" varchar(36),
	"message_id" varchar(255),
	"from_address" varchar(255) NOT NULL,
	"to_address" varchar(255),
	"subject" varchar(998),
	"body_text" text,
	"body_html" text,
	"raw_headers" json,
	"received_at" timestamp,
	"processing_status" "processing_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_client_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_code" varchar(255) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"direction" "mapping_direction" DEFAULT 'both' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_location_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_code" varchar(255) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"direction" "mapping_direction" DEFAULT 'both' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_priority_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_code" varchar(128) NOT NULL,
	"priority_id" varchar(36) NOT NULL,
	"direction" "mapping_direction" DEFAULT 'inbound' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_status_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_code" varchar(128) NOT NULL,
	"job_status_id" varchar(36) NOT NULL,
	"direction" "mapping_direction" DEFAULT 'inbound' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_trade_mappings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_code" varchar(128) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"direction" "mapping_direction" DEFAULT 'inbound' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_payload_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"sync_run_id" varchar(36),
	"direction" "io_direction" NOT NULL,
	"external_wo_id" varchar(255),
	"payload" json,
	"received_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_sync_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"sync_run_id" varchar(36) NOT NULL,
	"external_wo_id" varchar(255),
	"job_id" varchar(36),
	"event_type" varchar(64) NOT NULL,
	"outcome" "outcome" NOT NULL,
	"message" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_sync_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"run_type" varchar(64) NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"finished_at" timestamp,
	"counts" json,
	"error_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_work_order_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_wo_id" varchar(255) NOT NULL,
	"job_id" varchar(36),
	"link_status" "link_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"external_account_ref" varchar(255) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"config" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_credentials" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"external_system_id" varchar(36) NOT NULL,
	"credential_type" varchar(64) NOT NULL,
	"encrypted_payload" text,
	"key_ref" varchar(255),
	"expires_at" timestamp,
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_systems" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"config" json,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" "tenants_type" DEFAULT 'aggregator' NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"scope" "roles_scope" NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"tenant_id" varchar(36),
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by_user_id" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_contacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"title" varchar(128),
	"email" varchar(255),
	"phone" varchar(32),
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_locations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_code" varchar(64),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"address_line1" varchar(255) NOT NULL,
	"address_line2" varchar(255),
	"city" varchar(128) NOT NULL,
	"state_province" varchar(128) NOT NULL,
	"postal_code" varchar(32) NOT NULL,
	"country" varchar(2) DEFAULT 'US' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"vendor_code" varchar(64),
	"vendor_type" "vendors_vendor_type" DEFAULT 'local' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"main_phone" varchar(32),
	"main_email" varchar(255),
	"website" varchar(255),
	"tax_id" varchar(64),
	"notes" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_service_areas" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"vendor_location_id" varchar(36),
	"area_type" "vendor_coverage_area_type" NOT NULL,
	"area_label" varchar(120),
	"center_latitude" numeric(10, 7),
	"center_longitude" numeric(10, 7),
	"radius_miles" numeric(6, 2),
	"postal_code" varchar(32),
	"city" varchar(128),
	"county_name" varchar(128),
	"state_code" varchar(8),
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_trade_coverage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"vendor_location_id" varchar(36),
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_compliance" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"requirement_type" "vendor_details_requirement_type" NOT NULL,
	"coverage_amount" numeric(14, 2),
	"carrier" varchar(255),
	"policy_number" varchar(128),
	"effective_date" date,
	"expiry_date" date,
	"compliance_status" "vendor_details_compliance_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"vendor_location_id" varchar(36),
	"document_type" "vendor_details_document_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"file_url" varchar(1024),
	"file_size_bytes" bigint,
	"file_mime_type" varchar(127),
	"issued_date" date,
	"expiry_date" date,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_performance_scores" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"trade_id" varchar(36),
	"period_start" date,
	"period_end" date,
	"jobs_completed" integer,
	"jobs_on_time" integer,
	"total_dispatches" integer,
	"completion_rate" numeric(5, 2),
	"on_time_rate" numeric(5, 2),
	"avg_rating" numeric(3, 2),
	"score" numeric(6, 2),
	"computed_at" timestamp,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_rates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"trade_id" varchar(36),
	"vendor_location_id" varchar(36),
	"rate_type" "rate_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"unit" varchar(32),
	"effective_date" date,
	"expiry_date" date,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_statuses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	"code" varchar(32) NOT NULL,
	"category" "job_reference_category" NOT NULL,
	"sort_order" integer NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	"code" varchar(32) NOT NULL,
	"rank" integer NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_number" integer NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"primary_trade_id" varchar(36),
	"priority_id" varchar(36),
	"current_status_id" varchar(36) NOT NULL,
	"source_type" "jobs_source_type" DEFAULT 'manual' NOT NULL,
	"source_external_id" varchar(255),
	"problem_description" text NOT NULL,
	"scope_of_work" text,
	"generated_scope_of_work" text,
	"approved_scope_of_work" text,
	"scope_generation_status" varchar(32) DEFAULT 'not_started' NOT NULL,
	"not_to_exceed_amount" numeric(12, 2),
	"billing_model" "billing_model",
	"scheduled_start_at" timestamp,
	"scheduled_end_at" timestamp,
	"due_at" timestamp,
	"follow_up_at" timestamp,
	"follow_up_category" "jobs_follow_up_category",
	"completed_at" timestamp,
	"closed_at" timestamp,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_job_sequences" (
	"tenant_id" varchar(36) PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_user_id" varchar(36),
	"summary" varchar(500) NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_priority_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"from_priority_id" varchar(36),
	"to_priority_id" varchar(36) NOT NULL,
	"changed_by_user_id" varchar(36),
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"from_status_id" varchar(36),
	"to_status_id" varchar(36) NOT NULL,
	"changed_by_user_id" varchar(36),
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_trade_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"from_trade_id" varchar(36),
	"to_trade_id" varchar(36) NOT NULL,
	"changed_by_user_id" varchar(36),
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_attachments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"title" varchar(255) NOT NULL,
	"attachment_type" "job_details_attachment_type" DEFAULT 'other' NOT NULL,
	"file_url" varchar(1024),
	"file_size_bytes" bigint,
	"file_mime_type" varchar(127),
	"storage_key" varchar(1024),
	"checksum" varchar(255),
	"storage_provider" varchar(32),
	"visibility" "comm_visibility" DEFAULT 'internal_only' NOT NULL,
	"uploaded_by_user_id" varchar(36),
	"source_token_id" varchar(36),
	"vendor_invoice_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_contacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"title" varchar(128),
	"email" varchar(255),
	"phone" varchar(32),
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"body" text NOT NULL,
	"visibility" "comm_visibility" DEFAULT 'internal_only' NOT NULL,
	"origin" varchar(16) DEFAULT 'operator' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" varchar(36),
	"source_token_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"sent_at" timestamp,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_update_queue" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"target_portal" "portal_updates_target_portal" NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"queue_status" "portal_updates_queue_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"processed_at" timestamp,
	"last_error" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_update_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36),
	"content" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_template_steps" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"template_id" varchar(36) NOT NULL,
	"step_order" integer NOT NULL,
	"instruction" text NOT NULL,
	"category" varchar(32),
	"expects_photo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"trade_id" varchar(36),
	"description" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_scope_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"agent_run_id" varchar(36) NOT NULL,
	"proposed_steps" json NOT NULL,
	"status" "agent_draft_status" DEFAULT 'pending_review' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_scope_reviews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"draft_id" varchar(36) NOT NULL,
	"reviewer_user_id" varchar(36),
	"decision" "agent_review_decision" NOT NULL,
	"edited_steps" json,
	"review_notes" text,
	"reviewed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_scope_steps" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"step_order" integer NOT NULL,
	"instruction" text NOT NULL,
	"category" varchar(32),
	"expects_photo" boolean DEFAULT false NOT NULL,
	"source" "step_source" NOT NULL,
	"source_draft_id" varchar(36),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_approvals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"proposal_id" varchar(36) NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"approver_user_id" varchar(36),
	"approver_name" varchar(255),
	"decided_at" timestamp NOT NULL,
	"notes" text,
	"signature_ref" varchar(1024),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_line_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"line_number" integer NOT NULL,
	"category" "line_item_category" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(32),
	"unit_price" numeric(12, 2) NOT NULL,
	"extended_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 3),
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"markup_percent" numeric(6, 3),
	"markup_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trade_id" varchar(36),
	"rate_type" "rate_type",
	"proposal_id" varchar(36) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"parent_proposal_id" varchar(36),
	"supersedes_proposal_id" varchar(36),
	"revision_number" integer DEFAULT 1 NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"kind" "proposal_kind" DEFAULT 'client' NOT NULL,
	"title" varchar(255),
	"scope_snapshot" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"markup_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valid_until" timestamp,
	"notes" text,
	"sent_at" timestamp,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_invoice_line_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"line_number" integer NOT NULL,
	"category" "line_item_category" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(32),
	"unit_price" numeric(12, 2) NOT NULL,
	"extended_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 3),
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"vendor_invoice_id" varchar(36) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"vendor_id" varchar(36) NOT NULL,
	"assignment_id" varchar(36),
	"source_type" "vendor_invoice_source_type" DEFAULT 'manual' NOT NULL,
	"source_external_id" varchar(255),
	"invoice_number" varchar(128),
	"sequence_number" integer,
	"is_final" boolean DEFAULT false NOT NULL,
	"status" "vendor_invoice_status" DEFAULT 'received' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"nte_baseline_amount" numeric(12, 2),
	"exceeds_nte" boolean DEFAULT false NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"invoice_date" timestamp,
	"approved_by_user_id" varchar(36),
	"approved_at" timestamp,
	"notes" text,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"direction" "io_direction" NOT NULL,
	"client_invoice_id" varchar(36),
	"vendor_invoice_id" varchar(36),
	"job_id" varchar(36) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"method" varchar(64),
	"reference" varchar(255),
	"paid_at" timestamp NOT NULL,
	"recorded_by_user_id" varchar(36),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_assets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"asset_type" varchar(128),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_generation_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_schedule_id" varchar(36) NOT NULL,
	"requested_count" integer DEFAULT 0 NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_programs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"primary_trade_id" varchar(36),
	"priority_id" varchar(36),
	"scope_of_work" text NOT NULL,
	"auto_generate" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_schedule_locations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_schedule_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_program_id" varchar(36) NOT NULL,
	"frequency" "frequency" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"next_due_at" timestamp NOT NULL,
	"last_generated_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_visit_checklists" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_program_id" varchar(36) NOT NULL,
	"item_text" varchar(512) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_visit_results" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_visit_id" varchar(36) NOT NULL,
	"pm_visit_checklist_id" varchar(36) NOT NULL,
	"result" "result",
	"notes" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_visits" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"pm_schedule_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"pm_generation_run_id" varchar(36),
	"due_at" timestamp NOT NULL,
	"generation_status" "generation_status" NOT NULL,
	"skip_reason" varchar(512),
	"job_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_dispatches" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_event_site_id" varchar(36) NOT NULL,
	"job_id" varchar(36),
	"dispatch_status" "dispatch_status" DEFAULT 'staged' NOT NULL,
	"skip_reason" text,
	"spawned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_event_sites" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_event_id" varchar(36) NOT NULL,
	"snow_site_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_program_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"event_status" "event_status" DEFAULT 'declared' NOT NULL,
	"declared_at" timestamp DEFAULT now() NOT NULL,
	"declared_by_user_id" varchar(36),
	"snow_weather_observation_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_programs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"client_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"default_problem_description" text NOT NULL,
	"default_primary_trade_id" varchar(36),
	"default_priority_id" varchar(36),
	"auto_dispatch" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_service_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_dispatch_id" varchar(36) NOT NULL,
	"serviced_at" timestamp,
	"photo_refs" json,
	"gps_lat" numeric(10, 7),
	"gps_lng" numeric(10, 7),
	"notes" text,
	"logged_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_service_triggers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_program_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"trigger_type" varchar(32) DEFAULT 'manual' NOT NULL,
	"threshold_value" numeric(6, 2),
	"threshold_unit" varchar(16),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_sites" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_program_id" varchar(36) NOT NULL,
	"client_location_id" varchar(36) NOT NULL,
	"plow_priority" integer,
	"site_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snow_weather_observations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"snow_program_id" varchar(36),
	"observed_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"snow_depth" numeric(6, 2),
	"temperature" numeric(6, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_llm_keys" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"provider" "llm_key_provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_ref" varchar(255) NOT NULL,
	"status" "llm_key_status" DEFAULT 'active' NOT NULL,
	"label" varchar(255),
	"created_by_user_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_policies" ADD CONSTRAINT "ap_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policies" ADD CONSTRAINT "ap_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "apt_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_vendor_inv_fk" FOREIGN KEY ("vendor_invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invd_pub_client_inv_fk" FOREIGN KEY ("published_client_invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reviews" ADD CONSTRAINT "invr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reviews" ADD CONSTRAINT "invr_draft_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."invoice_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reviews" ADD CONSTRAINT "invr_reviewer_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "prpd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "prpd_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "prpd_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "prpd_pub_proposal_fk" FOREIGN KEY ("published_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "prpr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "prpr_draft_fk" FOREIGN KEY ("proposal_draft_id") REFERENCES "public"."proposal_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "prpr_reviewer_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_drafts" ADD CONSTRAINT "urd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_drafts" ADD CONSTRAINT "urd_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_drafts" ADD CONSTRAINT "urd_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_drafts" ADD CONSTRAINT "urd_pub_comm_fk" FOREIGN KEY ("published_communication_id") REFERENCES "public"."communication_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_reviews" ADD CONSTRAINT "urr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_reviews" ADD CONSTRAINT "urr_draft_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."update_rewrite_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_rewrite_reviews" ADD CONSTRAINT "urr_reviewer_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "ad_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "ad_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "ar_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "ar_triggered_by_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "ar_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "atc_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "atc_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_autonomy_settings" ADD CONSTRAINT "tas_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_trade_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_priority_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nte_rules" ADD CONSTRAINT "cnr_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_co_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."change_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_vendor_invoice_fk" FOREIGN KEY ("vendor_invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_client_invoice_fk" FOREIGN KEY ("client_invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_billing_events" ADD CONSTRAINT "jbe_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_approvals" ADD CONSTRAINT "coapp_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_approvals" ADD CONSTRAINT "coapp_co_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."change_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_approvals" ADD CONSTRAINT "coapp_user_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_line_items" ADD CONSTRAINT "coli_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_line_items" ADD CONSTRAINT "coli_co_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."change_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_order_line_items" ADD CONSTRAINT "coli_trade_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "co_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "co_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "co_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "co_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_rules" ADD CONSTRAINT "client_billing_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_rules" ADD CONSTRAINT "client_billing_rules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing_rules" ADD CONSTRAINT "client_billing_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_access_notes" ADD CONSTRAINT "client_location_access_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_access_notes" ADD CONSTRAINT "client_location_access_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_access_notes" ADD CONSTRAINT "cl_access_notes_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_contacts" ADD CONSTRAINT "client_location_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_contacts" ADD CONSTRAINT "client_location_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_contacts" ADD CONSTRAINT "cl_contacts_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_hours" ADD CONSTRAINT "client_location_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_location_hours" ADD CONSTRAINT "cl_hours_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rates" ADD CONSTRAINT "client_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rates" ADD CONSTRAINT "client_rates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rates" ADD CONSTRAINT "client_rates_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rates" ADD CONSTRAINT "client_rates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_line_items" ADD CONSTRAINT "cili_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_line_items" ADD CONSTRAINT "cili_invoice_fk" FOREIGN KEY ("client_invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoice_line_items" ADD CONSTRAINT "cili_trade_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "cinv_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "cinv_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "cinv_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "cinv_issued_by_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "cinv_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_update_logs" ADD CONSTRAINT "cul_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_update_logs" ADD CONSTRAINT "cul_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_update_logs" ADD CONSTRAINT "cul_source_draft_fk" FOREIGN KEY ("source_draft_id") REFERENCES "public"."update_rewrite_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_update_logs" ADD CONSTRAINT "cul_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "cl_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "cl_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "cl_sent_by_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "et_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "et_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "im_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "im_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "om_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "om_template_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "om_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignment_status_history" ADD CONSTRAINT "jvash_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignment_status_history" ADD CONSTRAINT "jvash_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignment_status_history" ADD CONSTRAINT "jvash_from_status_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."dispatch_assignment_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignment_status_history" ADD CONSTRAINT "jvash_to_status_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."dispatch_assignment_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignment_status_history" ADD CONSTRAINT "jvash_changed_by_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_vendor_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_vendor_location_fk" FOREIGN KEY ("vendor_location_id") REFERENCES "public"."vendor_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_vendor_contact_fk" FOREIGN KEY ("vendor_contact_id") REFERENCES "public"."vendor_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_status_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."dispatch_assignment_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_trade_fk" FOREIGN KEY ("matched_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_vendor_assignments" ADD CONSTRAINT "jva_replaces_fk" FOREIGN KEY ("replaces_assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_messages" ADD CONSTRAINT "dm_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_messages" ADD CONSTRAINT "dm_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_messages" ADD CONSTRAINT "dm_sent_by_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_ins" ADD CONSTRAINT "vci_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_ins" ADD CONSTRAINT "vci_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_ins" ADD CONSTRAINT "vci_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_outs" ADD CONSTRAINT "vco_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_outs" ADD CONSTRAINT "vco_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_check_outs" ADD CONSTRAINT "vco_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_eta_confirmations" ADD CONSTRAINT "vec_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_eta_confirmations" ADD CONSTRAINT "vec_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_eta_confirmations" ADD CONSTRAINT "vec_confirmed_by_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_assignment_statuses" ADD CONSTRAINT "dispatch_assignment_statuses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_blocked_vendors" ADD CONSTRAINT "location_blocked_vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_blocked_vendors" ADD CONSTRAINT "location_blocked_vendors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_blocked_vendors" ADD CONSTRAINT "location_blocked_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_blocked_vendors" ADD CONSTRAINT "location_blocked_vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_blocked_vendors" ADD CONSTRAINT "lbv_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_preferred_vendors" ADD CONSTRAINT "location_preferred_vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_preferred_vendors" ADD CONSTRAINT "location_preferred_vendors_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_preferred_vendors" ADD CONSTRAINT "location_preferred_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_preferred_vendors" ADD CONSTRAINT "location_preferred_vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_preferred_vendors" ADD CONSTRAINT "lpv_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "eatt_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "eatt_email_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_ingestion_accounts" ADD CONSTRAINT "eia_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_ingestion_accounts" ADD CONSTRAINT "eia_parser_rule_fk" FOREIGN KEY ("expected_parser_rule_id") REFERENCES "public"."email_parser_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_ingestion_accounts" ADD CONSTRAINT "eia_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_parse_results" ADD CONSTRAINT "epr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_parse_results" ADD CONSTRAINT "epr_email_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_parse_results" ADD CONSTRAINT "epr_rule_fk" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."email_parser_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_parser_rules" ADD CONSTRAINT "eprule_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_email_fk" FOREIGN KEY ("inbound_email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_parse_fk" FOREIGN KEY ("parse_result_id") REFERENCES "public"."email_parse_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_client_fk" FOREIGN KEY ("resolved_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_location_fk" FOREIGN KEY ("resolved_client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_trade_fk" FOREIGN KEY ("resolved_trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_priority_fk" FOREIGN KEY ("resolved_priority_id") REFERENCES "public"."priorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_job_fk" FOREIGN KEY ("created_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_work_order_drafts" ADD CONSTRAINT "ewod_reviewer_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "ie_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "ie_account_fk" FOREIGN KEY ("ingestion_account_id") REFERENCES "public"."email_ingestion_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_client_mappings" ADD CONSTRAINT "ecm_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_client_mappings" ADD CONSTRAINT "ecm_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_client_mappings" ADD CONSTRAINT "ecm_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_location_mappings" ADD CONSTRAINT "elm_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_location_mappings" ADD CONSTRAINT "elm_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_location_mappings" ADD CONSTRAINT "elm_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_location_mappings" ADD CONSTRAINT "elm_location_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_priority_mappings" ADD CONSTRAINT "external_priority_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_priority_mappings" ADD CONSTRAINT "external_priority_mappings_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_priority_mappings" ADD CONSTRAINT "epm_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_status_mappings" ADD CONSTRAINT "external_status_mappings_job_status_id_job_statuses_id_fk" FOREIGN KEY ("job_status_id") REFERENCES "public"."job_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_status_mappings" ADD CONSTRAINT "esm_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_trade_mappings" ADD CONSTRAINT "external_trade_mappings_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_trade_mappings" ADD CONSTRAINT "etm_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_payload_logs" ADD CONSTRAINT "epl_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_payload_logs" ADD CONSTRAINT "epl_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_payload_logs" ADD CONSTRAINT "epl_run_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."external_sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_events" ADD CONSTRAINT "ese_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_events" ADD CONSTRAINT "ese_run_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."external_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "esr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "esr_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work_order_links" ADD CONSTRAINT "ewol_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work_order_links" ADD CONSTRAINT "ewol_system_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work_order_links" ADD CONSTRAINT "ewol_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_accounts" ADD CONSTRAINT "external_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_accounts" ADD CONSTRAINT "external_accounts_external_system_id_external_systems_id_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_credentials" ADD CONSTRAINT "external_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_credentials" ADD CONSTRAINT "external_credentials_external_system_id_external_systems_id_fk" FOREIGN KEY ("external_system_id") REFERENCES "public"."external_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_systems" ADD CONSTRAINT "external_systems_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_systems" ADD CONSTRAINT "external_systems_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_locations" ADD CONSTRAINT "vendor_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_locations" ADD CONSTRAINT "vendor_locations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_locations" ADD CONSTRAINT "vendor_locations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_users" ADD CONSTRAINT "vendor_users_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vsa_location_fk" FOREIGN KEY ("vendor_location_id") REFERENCES "public"."vendor_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_trade_coverage" ADD CONSTRAINT "vendor_trade_coverage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_trade_coverage" ADD CONSTRAINT "vendor_trade_coverage_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_trade_coverage" ADD CONSTRAINT "vendor_trade_coverage_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_trade_coverage" ADD CONSTRAINT "vendor_trade_coverage_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_trade_coverage" ADD CONSTRAINT "vtc_location_fk" FOREIGN KEY ("vendor_location_id") REFERENCES "public"."vendor_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_compliance" ADD CONSTRAINT "vendor_compliance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_compliance" ADD CONSTRAINT "vendor_compliance_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_compliance" ADD CONSTRAINT "vendor_compliance_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_location_id_vendor_locations_id_fk" FOREIGN KEY ("vendor_location_id") REFERENCES "public"."vendor_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_performance_scores" ADD CONSTRAINT "vendor_performance_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_performance_scores" ADD CONSTRAINT "vendor_performance_scores_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_performance_scores" ADD CONSTRAINT "vendor_performance_scores_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_performance_scores" ADD CONSTRAINT "vendor_performance_scores_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_vendor_location_id_vendor_locations_id_fk" FOREIGN KEY ("vendor_location_id") REFERENCES "public"."vendor_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_statuses" ADD CONSTRAINT "job_statuses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_location_id_client_locations_id_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_primary_trade_id_trades_id_fk" FOREIGN KEY ("primary_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_current_status_id_job_statuses_id_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."job_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_job_sequences" ADD CONSTRAINT "tenant_job_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_priority_history" ADD CONSTRAINT "job_priority_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_priority_history" ADD CONSTRAINT "job_priority_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_priority_history" ADD CONSTRAINT "job_priority_history_from_priority_id_priorities_id_fk" FOREIGN KEY ("from_priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_priority_history" ADD CONSTRAINT "job_priority_history_to_priority_id_priorities_id_fk" FOREIGN KEY ("to_priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_priority_history" ADD CONSTRAINT "job_priority_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_from_status_id_job_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."job_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_to_status_id_job_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."job_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_trade_history" ADD CONSTRAINT "job_trade_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_trade_history" ADD CONSTRAINT "job_trade_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_trade_history" ADD CONSTRAINT "job_trade_history_from_trade_id_trades_id_fk" FOREIGN KEY ("from_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_trade_history" ADD CONSTRAINT "job_trade_history_to_trade_id_trades_id_fk" FOREIGN KEY ("to_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_trade_history" ADD CONSTRAINT "job_trade_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_source_token_id_magic_link_tokens_id_fk" FOREIGN KEY ("source_token_id") REFERENCES "public"."magic_link_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_vendor_invoice_id_vendor_invoices_id_fk" FOREIGN KEY ("vendor_invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_contacts" ADD CONSTRAINT "job_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_contacts" ADD CONSTRAINT "job_contacts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_contacts" ADD CONSTRAINT "job_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_source_token_id_magic_link_tokens_id_fk" FOREIGN KEY ("source_token_id") REFERENCES "public"."magic_link_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "mlt_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "mlt_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "mlt_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_update_queue" ADD CONSTRAINT "puq_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_update_queue" ADD CONSTRAINT "puq_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_update_logs" ADD CONSTRAINT "vul_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_update_logs" ADD CONSTRAINT "vul_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_update_logs" ADD CONSTRAINT "vul_vendor_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_template_steps" ADD CONSTRAINT "sts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_template_steps" ADD CONSTRAINT "sts_template_fk" FOREIGN KEY ("template_id") REFERENCES "public"."scope_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_templates" ADD CONSTRAINT "st_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_templates" ADD CONSTRAINT "st_trade_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_drafts" ADD CONSTRAINT "jsd_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_drafts" ADD CONSTRAINT "jsd_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_drafts" ADD CONSTRAINT "jsd_run_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_reviews" ADD CONSTRAINT "jsr_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_reviews" ADD CONSTRAINT "jsr_draft_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."job_scope_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_reviews" ADD CONSTRAINT "jsr_reviewer_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_steps" ADD CONSTRAINT "jss_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_steps" ADD CONSTRAINT "jss_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scope_steps" ADD CONSTRAINT "jss_source_draft_fk" FOREIGN KEY ("source_draft_id") REFERENCES "public"."job_scope_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "papp_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "papp_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "papp_user_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "pli_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "pli_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "pli_trade_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "prop_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "prop_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "prop_parent_fk" FOREIGN KEY ("parent_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "prop_supersedes_fk" FOREIGN KEY ("supersedes_proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "prop_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoice_line_items" ADD CONSTRAINT "vili_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoice_line_items" ADD CONSTRAINT "vili_invoice_fk" FOREIGN KEY ("vendor_invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_vendor_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_assignment_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."job_vendor_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_approved_by_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vinv_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "pay_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "pay_client_invoice_fk" FOREIGN KEY ("client_invoice_id") REFERENCES "public"."client_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "pay_vendor_invoice_fk" FOREIGN KEY ("vendor_invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "pay_job_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "pay_recorded_by_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_assets" ADD CONSTRAINT "fk_pm_assets_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_assets" ADD CONSTRAINT "fk_pm_assets_location" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_generation_runs" ADD CONSTRAINT "fk_pm_gen_runs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_generation_runs" ADD CONSTRAINT "fk_pm_gen_runs_schedule" FOREIGN KEY ("pm_schedule_id") REFERENCES "public"."pm_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_generation_runs" ADD CONSTRAINT "fk_pm_gen_runs_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_programs" ADD CONSTRAINT "fk_pm_programs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_programs" ADD CONSTRAINT "fk_pm_programs_client" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_programs" ADD CONSTRAINT "fk_pm_programs_trade" FOREIGN KEY ("primary_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_programs" ADD CONSTRAINT "fk_pm_programs_priority" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_programs" ADD CONSTRAINT "fk_pm_programs_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule_locations" ADD CONSTRAINT "fk_pmsl_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule_locations" ADD CONSTRAINT "fk_pmsl_schedule" FOREIGN KEY ("pm_schedule_id") REFERENCES "public"."pm_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedule_locations" ADD CONSTRAINT "fk_pmsl_location" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedules" ADD CONSTRAINT "fk_pm_schedules_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_schedules" ADD CONSTRAINT "fk_pm_schedules_program" FOREIGN KEY ("pm_program_id") REFERENCES "public"."pm_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visit_checklists" ADD CONSTRAINT "fk_pm_checklists_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visit_checklists" ADD CONSTRAINT "fk_pm_checklists_program" FOREIGN KEY ("pm_program_id") REFERENCES "public"."pm_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visit_results" ADD CONSTRAINT "fk_pm_results_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visit_results" ADD CONSTRAINT "fk_pm_results_visit" FOREIGN KEY ("pm_visit_id") REFERENCES "public"."pm_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visit_results" ADD CONSTRAINT "fk_pm_results_checklist" FOREIGN KEY ("pm_visit_checklist_id") REFERENCES "public"."pm_visit_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visits" ADD CONSTRAINT "fk_pm_visits_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visits" ADD CONSTRAINT "fk_pm_visits_schedule" FOREIGN KEY ("pm_schedule_id") REFERENCES "public"."pm_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visits" ADD CONSTRAINT "fk_pm_visits_location" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visits" ADD CONSTRAINT "fk_pm_visits_run" FOREIGN KEY ("pm_generation_run_id") REFERENCES "public"."pm_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_visits" ADD CONSTRAINT "fk_pm_visits_job" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_dispatches" ADD CONSTRAINT "fk_disp_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_dispatches" ADD CONSTRAINT "fk_disp_event_site" FOREIGN KEY ("snow_event_site_id") REFERENCES "public"."snow_event_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_dispatches" ADD CONSTRAINT "fk_disp_job" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_event_sites" ADD CONSTRAINT "fk_ses_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_event_sites" ADD CONSTRAINT "fk_ses_event" FOREIGN KEY ("snow_event_id") REFERENCES "public"."snow_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_event_sites" ADD CONSTRAINT "fk_ses_site" FOREIGN KEY ("snow_site_id") REFERENCES "public"."snow_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_events" ADD CONSTRAINT "fk_sevent_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_events" ADD CONSTRAINT "fk_sevent_program" FOREIGN KEY ("snow_program_id") REFERENCES "public"."snow_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_events" ADD CONSTRAINT "fk_sevent_declared_by" FOREIGN KEY ("declared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_events" ADD CONSTRAINT "fk_sevent_weather" FOREIGN KEY ("snow_weather_observation_id") REFERENCES "public"."snow_weather_observations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_programs" ADD CONSTRAINT "fk_sprog_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_programs" ADD CONSTRAINT "fk_sprog_client" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_programs" ADD CONSTRAINT "fk_sprog_trade" FOREIGN KEY ("default_primary_trade_id") REFERENCES "public"."trades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_programs" ADD CONSTRAINT "fk_sprog_priority" FOREIGN KEY ("default_priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_programs" ADD CONSTRAINT "fk_sprog_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_service_logs" ADD CONSTRAINT "fk_slog_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_service_logs" ADD CONSTRAINT "fk_slog_dispatch" FOREIGN KEY ("snow_dispatch_id") REFERENCES "public"."snow_dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_service_logs" ADD CONSTRAINT "fk_slog_logged_by" FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_service_triggers" ADD CONSTRAINT "fk_strig_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_service_triggers" ADD CONSTRAINT "fk_strig_program" FOREIGN KEY ("snow_program_id") REFERENCES "public"."snow_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_sites" ADD CONSTRAINT "fk_ssite_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_sites" ADD CONSTRAINT "fk_ssite_program" FOREIGN KEY ("snow_program_id") REFERENCES "public"."snow_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_sites" ADD CONSTRAINT "fk_ssite_location" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_weather_observations" ADD CONSTRAINT "fk_swobs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snow_weather_observations" ADD CONSTRAINT "fk_swobs_program" FOREIGN KEY ("snow_program_id") REFERENCES "public"."snow_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_llm_keys" ADD CONSTRAINT "tlk_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_llm_keys" ADD CONSTRAINT "tlk_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_lookup_idx" ON "agent_policies" USING btree ("tenant_id","agent_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apd_agent_unique" ON "agent_policy_defaults" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aptd_agent_variant_unique" ON "ai_prompt_template_defaults" USING btree ("agent_id","variant");--> statement-breakpoint
CREATE UNIQUE INDEX "apt_tenant_agent_variant_version_unique" ON "ai_prompt_templates" USING btree ("tenant_id","agent_id","variant","version");--> statement-breakpoint
CREATE INDEX "apt_lookup_idx" ON "ai_prompt_templates" USING btree ("tenant_id","agent_id","variant","status");--> statement-breakpoint
CREATE INDEX "invd_tenant_job_idx" ON "invoice_drafts" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "invd_tenant_status_idx" ON "invoice_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "invd_run_idx" ON "invoice_drafts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "invd_vendor_inv_idx" ON "invoice_drafts" USING btree ("vendor_invoice_id");--> statement-breakpoint
CREATE INDEX "invr_draft_idx" ON "invoice_reviews" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "prpd_tenant_job_idx" ON "proposal_drafts" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "prpd_tenant_status_idx" ON "proposal_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "prpd_run_idx" ON "proposal_drafts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "prpr_draft_idx" ON "proposal_reviews" USING btree ("proposal_draft_id");--> statement-breakpoint
CREATE INDEX "urd_tenant_job_idx" ON "update_rewrite_drafts" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "urd_tenant_status_idx" ON "update_rewrite_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "urd_run_idx" ON "update_rewrite_drafts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "urd_source_idx" ON "update_rewrite_drafts" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "urr_draft_idx" ON "update_rewrite_reviews" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "ad_run_idx" ON "agent_decisions" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "ar_tenant_agent_created_idx" ON "agent_runs" USING btree ("tenant_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "ar_tenant_status_idx" ON "agent_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "ar_job_idx" ON "agent_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "atc_run_seq_idx" ON "agent_tool_calls" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tas_tenant_unique" ON "tenant_autonomy_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cnr_resolve_idx" ON "client_nte_rules" USING btree ("tenant_id","client_id","trade_id","priority_id");--> statement-breakpoint
CREATE INDEX "cnr_tenant_client_idx" ON "client_nte_rules" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "jbe_job_created_idx" ON "job_billing_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "jbe_tenant_job_idx" ON "job_billing_events" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "jbe_tenant_type_idx" ON "job_billing_events" USING btree ("tenant_id","event_type");--> statement-breakpoint
CREATE INDEX "coapp_tenant_co_idx" ON "change_order_approvals" USING btree ("tenant_id","change_order_id");--> statement-breakpoint
CREATE INDEX "coli_tenant_co_idx" ON "change_order_line_items" USING btree ("tenant_id","change_order_id");--> statement-breakpoint
CREATE INDEX "co_tenant_job_idx" ON "change_orders" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "co_tenant_status_idx" ON "change_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "client_billing_rules_tenant_idx" ON "client_billing_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_billing_rules_client_idx" ON "client_billing_rules" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_tenant_idx" ON "client_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_location_access_notes_tenant_idx" ON "client_location_access_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_location_access_notes_location_idx" ON "client_location_access_notes" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "client_location_contacts_tenant_idx" ON "client_location_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_location_contacts_location_idx" ON "client_location_contacts" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "client_location_hours_tenant_idx" ON "client_location_hours" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_location_hours_location_idx" ON "client_location_hours" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "client_rates_tenant_client_idx" ON "client_rates" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "cili_tenant_invoice_idx" ON "client_invoice_line_items" USING btree ("tenant_id","client_invoice_id");--> statement-breakpoint
CREATE INDEX "cinv_tenant_job_idx" ON "client_invoices" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "cinv_tenant_client_idx" ON "client_invoices" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "cinv_tenant_status_idx" ON "client_invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "cul_tenant_job_idx" ON "client_update_logs" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_locations_client_code_unique" ON "client_locations" USING btree ("client_id","location_code");--> statement-breakpoint
CREATE INDEX "client_locations_tenant_idx" ON "client_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "client_locations_client_idx" ON "client_locations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_locations_status_idx" ON "client_locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_users_tenant_user_client_unique" ON "client_users" USING btree ("tenant_id","user_id","client_id");--> statement-breakpoint
CREATE INDEX "client_users_tenant_client_idx" ON "client_users" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tenant_name_unique" ON "clients" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tenant_code_unique" ON "clients" USING btree ("tenant_id","client_code");--> statement-breakpoint
CREATE INDEX "clients_tenant_idx" ON "clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cl_tenant_job_created_idx" ON "communication_logs" USING btree ("tenant_id","job_id","created_at");--> statement-breakpoint
CREATE INDEX "cl_source_idx" ON "communication_logs" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "cl_tenant_status_idx" ON "communication_logs" USING btree ("tenant_id","delivery_status");--> statement-breakpoint
CREATE INDEX "cl_tenant_channel_idx" ON "communication_logs" USING btree ("tenant_id","channel");--> statement-breakpoint
CREATE INDEX "cl_tenant_recipient_idx" ON "communication_logs" USING btree ("tenant_id","recipient_type","recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "et_tenant_name_unique" ON "email_templates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "im_tenant_parse_idx" ON "inbound_messages" USING btree ("tenant_id","parse_status");--> statement-breakpoint
CREATE INDEX "om_tenant_idx" ON "outbound_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "jvash_tenant_assignment_idx" ON "job_vendor_assignment_status_history" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "jva_tenant_job_idx" ON "job_vendor_assignments" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "jva_tenant_vendor_idx" ON "job_vendor_assignments" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "jva_tenant_status_idx" ON "job_vendor_assignments" USING btree ("tenant_id","current_status_id");--> statement-breakpoint
CREATE INDEX "jva_replaces_idx" ON "job_vendor_assignments" USING btree ("replaces_assignment_id");--> statement-breakpoint
CREATE INDEX "dm_assignment_created_idx" ON "dispatch_messages" USING btree ("assignment_id","created_at");--> statement-breakpoint
CREATE INDEX "dm_tenant_assignment_idx" ON "dispatch_messages" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "vci_assignment_occurred_idx" ON "vendor_check_ins" USING btree ("assignment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vci_tenant_assignment_idx" ON "vendor_check_ins" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "vco_assignment_occurred_idx" ON "vendor_check_outs" USING btree ("assignment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vco_tenant_assignment_idx" ON "vendor_check_outs" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "vec_assignment_created_idx" ON "vendor_eta_confirmations" USING btree ("assignment_id","created_at");--> statement-breakpoint
CREATE INDEX "vec_tenant_assignment_idx" ON "vendor_eta_confirmations" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "das_code_unique" ON "dispatch_assignment_statuses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "das_name_unique" ON "dispatch_assignment_statuses" USING btree ("name");--> statement-breakpoint
CREATE INDEX "das_status_idx" ON "dispatch_assignment_statuses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lbv_location_vendor_idx" ON "location_blocked_vendors" USING btree ("tenant_id","client_location_id","vendor_id");--> statement-breakpoint
CREATE INDEX "lbv_client_vendor_idx" ON "location_blocked_vendors" USING btree ("tenant_id","client_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lpv_location_trade_vendor_unique" ON "location_preferred_vendors" USING btree ("client_location_id","trade_id","vendor_id");--> statement-breakpoint
CREATE INDEX "lpv_lookup_idx" ON "location_preferred_vendors" USING btree ("tenant_id","client_location_id","trade_id");--> statement-breakpoint
CREATE INDEX "email_attachments_tenant_idx" ON "email_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_attachments_email_idx" ON "email_attachments" USING btree ("inbound_email_id");--> statement-breakpoint
CREATE INDEX "email_ingestion_accounts_tenant_status_idx" ON "email_ingestion_accounts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "email_ingestion_accounts_tenant_idx" ON "email_ingestion_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_ingestion_accounts_parser_rule_idx" ON "email_ingestion_accounts" USING btree ("expected_parser_rule_id");--> statement-breakpoint
CREATE INDEX "email_ingestion_accounts_creator_idx" ON "email_ingestion_accounts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "email_parse_results_tenant_idx" ON "email_parse_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_parse_results_email_idx" ON "email_parse_results" USING btree ("inbound_email_id");--> statement-breakpoint
CREATE INDEX "email_parse_results_rule_idx" ON "email_parse_results" USING btree ("matched_rule_id");--> statement-breakpoint
CREATE INDEX "email_parse_results_outcome_idx" ON "email_parse_results" USING btree ("tenant_id","parse_outcome");--> statement-breakpoint
CREATE INDEX "email_parser_rules_tenant_status_idx" ON "email_parser_rules" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "email_parser_rules_tenant_idx" ON "email_parser_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_tenant_status_idx" ON "email_work_order_drafts" USING btree ("tenant_id","draft_status");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_tenant_idx" ON "email_work_order_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_email_idx" ON "email_work_order_drafts" USING btree ("inbound_email_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_parse_idx" ON "email_work_order_drafts" USING btree ("parse_result_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_client_idx" ON "email_work_order_drafts" USING btree ("resolved_client_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_location_idx" ON "email_work_order_drafts" USING btree ("resolved_client_location_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_trade_idx" ON "email_work_order_drafts" USING btree ("resolved_trade_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_priority_idx" ON "email_work_order_drafts" USING btree ("resolved_priority_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_job_idx" ON "email_work_order_drafts" USING btree ("created_job_id");--> statement-breakpoint
CREATE INDEX "email_work_order_drafts_reviewer_idx" ON "email_work_order_drafts" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_tenant_message_idx" ON "inbound_emails" USING btree ("tenant_id","message_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_tenant_status_idx" ON "inbound_emails" USING btree ("tenant_id","processing_status");--> statement-breakpoint
CREATE INDEX "inbound_emails_tenant_idx" ON "inbound_emails" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_account_idx" ON "inbound_emails" USING btree ("ingestion_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_client_mappings_system_code_unique" ON "external_client_mappings" USING btree ("external_system_id","external_code");--> statement-breakpoint
CREATE INDEX "external_client_mappings_tenant_idx" ON "external_client_mappings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_client_mappings_system_idx" ON "external_client_mappings" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_client_mappings_client_idx" ON "external_client_mappings" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_location_mappings_system_client_code_unique" ON "external_location_mappings" USING btree ("external_system_id","client_id","external_code");--> statement-breakpoint
CREATE INDEX "external_location_mappings_tenant_idx" ON "external_location_mappings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_location_mappings_system_idx" ON "external_location_mappings" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_location_mappings_client_idx" ON "external_location_mappings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "external_location_mappings_location_idx" ON "external_location_mappings" USING btree ("client_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_priority_mappings_tenant_system_code_dir_unique" ON "external_priority_mappings" USING btree ("tenant_id","external_system_id","external_code","direction");--> statement-breakpoint
CREATE INDEX "external_priority_mappings_tenant_idx" ON "external_priority_mappings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_priority_mappings_system_idx" ON "external_priority_mappings" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_priority_mappings_priority_idx" ON "external_priority_mappings" USING btree ("priority_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_status_mappings_system_code_dir_unique" ON "external_status_mappings" USING btree ("external_system_id","external_code","direction");--> statement-breakpoint
CREATE INDEX "external_status_mappings_system_idx" ON "external_status_mappings" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_status_mappings_status_idx" ON "external_status_mappings" USING btree ("job_status_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_trade_mappings_system_code_dir_unique" ON "external_trade_mappings" USING btree ("external_system_id","external_code","direction");--> statement-breakpoint
CREATE INDEX "external_trade_mappings_system_idx" ON "external_trade_mappings" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_trade_mappings_trade_idx" ON "external_trade_mappings" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "external_payload_logs_tenant_idx" ON "external_payload_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_payload_logs_system_idx" ON "external_payload_logs" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_payload_logs_run_idx" ON "external_payload_logs" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "external_payload_logs_wo_idx" ON "external_payload_logs" USING btree ("external_wo_id");--> statement-breakpoint
CREATE INDEX "external_sync_events_tenant_idx" ON "external_sync_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_sync_events_run_idx" ON "external_sync_events" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "external_sync_events_wo_idx" ON "external_sync_events" USING btree ("external_wo_id");--> statement-breakpoint
CREATE INDEX "external_sync_events_job_idx" ON "external_sync_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "external_sync_runs_tenant_idx" ON "external_sync_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_sync_runs_system_idx" ON "external_sync_runs" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_sync_runs_tenant_status_idx" ON "external_sync_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "external_work_order_links_system_wo_unique" ON "external_work_order_links" USING btree ("external_system_id","external_wo_id");--> statement-breakpoint
CREATE INDEX "external_work_order_links_tenant_idx" ON "external_work_order_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_work_order_links_system_idx" ON "external_work_order_links" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_work_order_links_job_idx" ON "external_work_order_links" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "external_accounts_tenant_system_idx" ON "external_accounts" USING btree ("tenant_id","external_system_id");--> statement-breakpoint
CREATE INDEX "external_accounts_tenant_idx" ON "external_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_accounts_system_idx" ON "external_accounts" USING btree ("external_system_id");--> statement-breakpoint
CREATE INDEX "external_credentials_tenant_idx" ON "external_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_credentials_system_idx" ON "external_credentials" USING btree ("external_system_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_systems_tenant_provider_name_unique" ON "external_systems" USING btree ("tenant_id","provider","name");--> statement-breakpoint
CREATE INDEX "external_systems_tenant_status_idx" ON "external_systems" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "external_systems_tenant_idx" ON "external_systems" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_systems_created_by_idx" ON "external_systems" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_tenant_user_unique" ON "tenant_users" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "tenant_users_user_idx" ON "tenant_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenant_users_tenant_idx" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_tenant_unique" ON "user_roles" USING btree ("user_id","role_id","tenant_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_tenant_idx" ON "user_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_name_unique" ON "trades" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_code_unique" ON "trades" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trades_status_idx" ON "trades" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_contacts_tenant_idx" ON "vendor_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendor_contacts_vendor_idx" ON "vendor_contacts" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_locations_vendor_code_unique" ON "vendor_locations" USING btree ("vendor_id","location_code");--> statement-breakpoint
CREATE INDEX "vendor_locations_tenant_idx" ON "vendor_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendor_locations_vendor_idx" ON "vendor_locations" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_locations_status_idx" ON "vendor_locations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_users_tenant_user_vendor_unique" ON "vendor_users" USING btree ("tenant_id","user_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_users_tenant_vendor_idx" ON "vendor_users" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendors_tenant_name_idx" ON "vendors" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_tenant_code_unique" ON "vendors" USING btree ("tenant_id","vendor_code");--> statement-breakpoint
CREATE INDEX "vendors_tenant_idx" ON "vendors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendors_type_idx" ON "vendors" USING btree ("vendor_type");--> statement-breakpoint
CREATE INDEX "vsa_tenant_vendor_idx" ON "vendor_service_areas" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vsa_tenant_type_postal_idx" ON "vendor_service_areas" USING btree ("tenant_id","area_type","postal_code");--> statement-breakpoint
CREATE INDEX "vsa_tenant_type_state_idx" ON "vendor_service_areas" USING btree ("tenant_id","area_type","state_code");--> statement-breakpoint
CREATE INDEX "vsa_tenant_type_city_state_idx" ON "vendor_service_areas" USING btree ("tenant_id","area_type","city","state_code");--> statement-breakpoint
CREATE UNIQUE INDEX "vtc_vendor_trade_location_unique" ON "vendor_trade_coverage" USING btree ("vendor_id","trade_id","vendor_location_id");--> statement-breakpoint
CREATE INDEX "vtc_tenant_vendor_idx" ON "vendor_trade_coverage" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_compliance_tenant_vendor_idx" ON "vendor_compliance" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_tenant_vendor_idx" ON "vendor_documents" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_performance_scores_tenant_vendor_idx" ON "vendor_performance_scores" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_rates_tenant_vendor_idx" ON "vendor_rates" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_statuses_code_unique" ON "job_statuses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "job_statuses_name_unique" ON "job_statuses" USING btree ("name");--> statement-breakpoint
CREATE INDEX "job_statuses_status_idx" ON "job_statuses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_tenant_code_unique" ON "priorities" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_tenant_name_unique" ON "priorities" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "priorities_tenant_idx" ON "priorities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "priorities_status_idx" ON "priorities" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_tenant_number_unique" ON "jobs" USING btree ("tenant_id","job_number");--> statement-breakpoint
CREATE INDEX "jobs_tenant_status_idx" ON "jobs" USING btree ("tenant_id","current_status_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_client_idx" ON "jobs" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_location_idx" ON "jobs" USING btree ("tenant_id","client_location_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_trade_idx" ON "jobs" USING btree ("tenant_id","primary_trade_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_priority_idx" ON "jobs" USING btree ("tenant_id","priority_id");--> statement-breakpoint
CREATE INDEX "jobs_tenant_created_idx" ON "jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_tenant_due_idx" ON "jobs" USING btree ("tenant_id","due_at");--> statement-breakpoint
CREATE INDEX "jobs_tenant_followup_idx" ON "jobs" USING btree ("tenant_id","follow_up_at");--> statement-breakpoint
CREATE INDEX "jobs_tenant_source_idx" ON "jobs" USING btree ("tenant_id","source_type");--> statement-breakpoint
CREATE INDEX "job_events_job_created_idx" ON "job_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_events_tenant_job_idx" ON "job_events" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_priority_history_tenant_job_idx" ON "job_priority_history" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_status_history_tenant_job_idx" ON "job_status_history" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_trade_history_tenant_job_idx" ON "job_trade_history" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_attachments_tenant_job_idx" ON "job_attachments" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_attachments_tenant_vendor_invoice_idx" ON "job_attachments" USING btree ("tenant_id","vendor_invoice_id");--> statement-breakpoint
CREATE INDEX "job_contacts_tenant_job_idx" ON "job_contacts" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "job_notes_tenant_job_idx" ON "job_notes" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mlt_token_hash_unique" ON "magic_link_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mlt_tenant_assignment_idx" ON "magic_link_tokens" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX "puq_tenant_status_idx" ON "portal_update_queue" USING btree ("tenant_id","queue_status");--> statement-breakpoint
CREATE INDEX "puq_source_idx" ON "portal_update_queue" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "vul_tenant_job_idx" ON "vendor_update_logs" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "sts_template_order_idx" ON "scope_template_steps" USING btree ("template_id","step_order");--> statement-breakpoint
CREATE INDEX "st_tenant_idx" ON "scope_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "jsd_tenant_job_idx" ON "job_scope_drafts" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "jsd_tenant_status_idx" ON "job_scope_drafts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "jsd_run_idx" ON "job_scope_drafts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "jsr_draft_idx" ON "job_scope_reviews" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "jss_tenant_job_order_idx" ON "job_scope_steps" USING btree ("tenant_id","job_id","step_order");--> statement-breakpoint
CREATE INDEX "papp_tenant_proposal_idx" ON "proposal_approvals" USING btree ("tenant_id","proposal_id");--> statement-breakpoint
CREATE INDEX "pli_tenant_proposal_idx" ON "proposal_line_items" USING btree ("tenant_id","proposal_id");--> statement-breakpoint
CREATE INDEX "prop_tenant_job_idx" ON "proposals" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "prop_tenant_status_idx" ON "proposals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "prop_tenant_kind_status_idx" ON "proposals" USING btree ("tenant_id","kind","status");--> statement-breakpoint
CREATE INDEX "prop_parent_idx" ON "proposals" USING btree ("parent_proposal_id");--> statement-breakpoint
CREATE INDEX "vili_tenant_invoice_idx" ON "vendor_invoice_line_items" USING btree ("tenant_id","vendor_invoice_id");--> statement-breakpoint
CREATE INDEX "vinv_tenant_job_idx" ON "vendor_invoices" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "vinv_tenant_vendor_idx" ON "vendor_invoices" USING btree ("tenant_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vinv_tenant_status_idx" ON "vendor_invoices" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "pay_tenant_job_idx" ON "payment_records" USING btree ("tenant_id","job_id");--> statement-breakpoint
CREATE INDEX "pay_client_invoice_idx" ON "payment_records" USING btree ("client_invoice_id");--> statement-breakpoint
CREATE INDEX "pay_vendor_invoice_idx" ON "payment_records" USING btree ("vendor_invoice_id");--> statement-breakpoint
CREATE INDEX "pay_tenant_direction_idx" ON "payment_records" USING btree ("tenant_id","direction");--> statement-breakpoint
CREATE INDEX "pm_assets_tenant_idx" ON "pm_assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_assets_location_idx" ON "pm_assets" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "pm_generation_runs_tenant_idx" ON "pm_generation_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_generation_runs_schedule_idx" ON "pm_generation_runs" USING btree ("pm_schedule_id");--> statement-breakpoint
CREATE INDEX "pm_generation_runs_created_by_idx" ON "pm_generation_runs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "pm_programs_tenant_idx" ON "pm_programs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_programs_tenant_client_idx" ON "pm_programs" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "pm_programs_trade_idx" ON "pm_programs" USING btree ("primary_trade_id");--> statement-breakpoint
CREATE INDEX "pm_programs_priority_idx" ON "pm_programs" USING btree ("priority_id");--> statement-breakpoint
CREATE INDEX "pm_programs_created_by_idx" ON "pm_programs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "pm_schedule_locations_tenant_idx" ON "pm_schedule_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_schedule_locations_schedule_idx" ON "pm_schedule_locations" USING btree ("pm_schedule_id");--> statement-breakpoint
CREATE INDEX "pm_schedule_locations_location_idx" ON "pm_schedule_locations" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "pm_schedules_tenant_idx" ON "pm_schedules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_schedules_program_idx" ON "pm_schedules" USING btree ("pm_program_id");--> statement-breakpoint
CREATE INDEX "pm_schedules_due_idx" ON "pm_schedules" USING btree ("is_active","next_due_at");--> statement-breakpoint
CREATE INDEX "pm_visit_checklists_tenant_idx" ON "pm_visit_checklists" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_visit_checklists_program_idx" ON "pm_visit_checklists" USING btree ("pm_program_id");--> statement-breakpoint
CREATE INDEX "pm_visit_results_tenant_idx" ON "pm_visit_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_visit_results_visit_idx" ON "pm_visit_results" USING btree ("pm_visit_id");--> statement-breakpoint
CREATE INDEX "pm_visit_results_checklist_idx" ON "pm_visit_results" USING btree ("pm_visit_checklist_id");--> statement-breakpoint
CREATE INDEX "pm_visits_tenant_idx" ON "pm_visits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pm_visits_schedule_idx" ON "pm_visits" USING btree ("pm_schedule_id");--> statement-breakpoint
CREATE INDEX "pm_visits_location_idx" ON "pm_visits" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "pm_visits_run_idx" ON "pm_visits" USING btree ("pm_generation_run_id");--> statement-breakpoint
CREATE INDEX "pm_visits_job_idx" ON "pm_visits" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pm_visits_tenant_status_idx" ON "pm_visits" USING btree ("tenant_id","generation_status");--> statement-breakpoint
CREATE INDEX "snow_dispatches_tenant_idx" ON "snow_dispatches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_dispatches_event_site_idx" ON "snow_dispatches" USING btree ("snow_event_site_id");--> statement-breakpoint
CREATE INDEX "snow_dispatches_job_idx" ON "snow_dispatches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "snow_dispatches_status_idx" ON "snow_dispatches" USING btree ("dispatch_status");--> statement-breakpoint
CREATE INDEX "snow_event_sites_tenant_idx" ON "snow_event_sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_event_sites_event_idx" ON "snow_event_sites" USING btree ("snow_event_id");--> statement-breakpoint
CREATE INDEX "snow_event_sites_site_idx" ON "snow_event_sites" USING btree ("snow_site_id");--> statement-breakpoint
CREATE INDEX "snow_events_tenant_idx" ON "snow_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_events_program_idx" ON "snow_events" USING btree ("snow_program_id");--> statement-breakpoint
CREATE INDEX "snow_events_status_idx" ON "snow_events" USING btree ("event_status");--> statement-breakpoint
CREATE INDEX "snow_events_declared_by_idx" ON "snow_events" USING btree ("declared_by_user_id");--> statement-breakpoint
CREATE INDEX "snow_programs_tenant_idx" ON "snow_programs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_programs_tenant_client_idx" ON "snow_programs" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "snow_programs_trade_idx" ON "snow_programs" USING btree ("default_primary_trade_id");--> statement-breakpoint
CREATE INDEX "snow_programs_priority_idx" ON "snow_programs" USING btree ("default_priority_id");--> statement-breakpoint
CREATE INDEX "snow_programs_created_by_idx" ON "snow_programs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "snow_service_logs_tenant_idx" ON "snow_service_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_service_logs_dispatch_idx" ON "snow_service_logs" USING btree ("snow_dispatch_id");--> statement-breakpoint
CREATE INDEX "snow_service_logs_logged_by_idx" ON "snow_service_logs" USING btree ("logged_by_user_id");--> statement-breakpoint
CREATE INDEX "snow_service_triggers_tenant_idx" ON "snow_service_triggers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_service_triggers_program_idx" ON "snow_service_triggers" USING btree ("snow_program_id");--> statement-breakpoint
CREATE INDEX "snow_sites_tenant_idx" ON "snow_sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_sites_program_idx" ON "snow_sites" USING btree ("snow_program_id");--> statement-breakpoint
CREATE INDEX "snow_sites_location_idx" ON "snow_sites" USING btree ("client_location_id");--> statement-breakpoint
CREATE INDEX "snow_weather_observations_tenant_idx" ON "snow_weather_observations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "snow_weather_observations_program_idx" ON "snow_weather_observations" USING btree ("snow_program_id");--> statement-breakpoint
CREATE INDEX "tlk_tenant_provider_status_idx" ON "tenant_llm_keys" USING btree ("tenant_id","provider","status");