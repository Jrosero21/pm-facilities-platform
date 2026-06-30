import {
  timestamp,
  numeric,
  foreignKey,
  index,
  integer,
  json,
  text,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { clients, clientLocations } from "./clients";
import { trades } from "./trades";
import { priorities } from "./job-reference";
import { jobs } from "./jobs";

// ── Phase 13 batch 13c (migration 0033) — EMAIL-INGESTION CONFIG SUBSTRATE (Group 1) ──
// The two config tables of the email-ingestion framework, with NO inbound-email
// dependencies: email_parser_rules (the deterministic-seam format/extraction config +
// the sender→format coarse router) and email_ingestion_accounts (the monitored intake
// identities + the source_type provenance discriminator). Both are tenant-scoped.
//
// D-7 INVARIANT (13b): email_parser_rules is CONFIG-ONLY — format + sender-router +
// extraction config. It holds NO client→id mapping; client resolution stays in the
// frozen Phase-12 external_client_mappings resolver (D-1). One resolution system.
//
// PRE-NAMED FKs (WP-12.2): the long email_* table names make drizzle's auto FK names
// exceed MySQL's 64-char limit (the same lesson as the Phase-12 external_* tables —
// see external-mappings.ts esm_/etm_). Every FK is pre-named with a short prefix
// (eprule_ / eia_) via the foreignKey() builder; the column is a plain varchar (no
// inline .references()). FK-backing indexes are declared EXPLICITLY (the 6d/6g lesson).
//
// extraction_config is json (MariaDB → longtext + json_valid CHECK); like every json
// column in this codebase it round-trips as a RAW STRING on read — parse at the read
// boundary when the deterministic seam consumes it (CF-13.3; the drafts.ts:110 / billing
// events.ts:153 precedent). No reader exists this phase (the seam is a Phase-13 stub).

const statusEnum = ["active", "inactive", "archived"] as const;
// D-6: provenance discriminator. email_ingestion = arrived at a monitored intake
// address; forwarded_email = a human forwarded it in. Stamped onto the resulting job's
// source_type (both values already exist on jobs.source_type — 13a live-confirmed).
const sourceTypeEnum = ["email_ingestion", "forwarded_email"] as const;

// ── email_parser_rules (manifest §4.6) — authored FIRST (accounts FK-references it) ──
export const emailParserRules = pgTable(
  "email_parser_rules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Pre-named FK (eprule_tenant_fk): the auto name
    // email_parser_rules_tenant_id_tenants_id_fk is 48 chars, but we pre-name for
    // consistency with the FK-heavy Group-2 tables and to bank the convention.
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    // D-1 coarse router: sender domain/address pattern selecting which format to attempt.
    // Nullable — a rule may match purely on format_key / account binding.
    matchSenderPattern: varchar("match_sender_pattern", { length: 255 }),
    formatKey: varchar("format_key", { length: 128 }).notNull(),
    // Field-extraction spec for the deterministic seam (CF-13.3 fills the logic).
    // json → longtext+json_valid; parse-at-read at the seam. NO client→id mapping (D-7).
    extractionConfig: json("extraction_config"),
    // Reserved, mirrors the external_*_mappings direction convention.
    direction: varchar("direction", { length: 32 }),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "eprule_tenant_fk",
    }).onDelete("cascade"),
    index("email_parser_rules_tenant_status_idx").on(t.tenantId, t.status),
    index("email_parser_rules_tenant_idx").on(t.tenantId),
  ],
);

// ── email_ingestion_accounts (manifest §4.1) — FK → email_parser_rules ──
export const emailIngestionAccounts = pgTable(
  "email_ingestion_accounts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    intakeAddress: varchar("intake_address", { length: 255 }).notNull(),
    // D-6 provenance discriminator (stamped onto the resulting job's source_type).
    sourceType: mysqlEnum("source_type", sourceTypeEnum).notNull(),
    // The default parser-rule this account expects. Nullable; SET NULL if the rule is
    // deleted (the account survives — its format binding is advisory, not existential).
    expectedParserRuleId: varchar("expected_parser_rule_id", { length: 36 }),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    // SET NULL: preserve the account if its creator is deleted (the D-12c.1 pattern).
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "eia_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.expectedParserRuleId],
      foreignColumns: [emailParserRules.id],
      name: "eia_parser_rule_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "eia_creator_fk",
    }).onDelete("set null"),
    index("email_ingestion_accounts_tenant_status_idx").on(t.tenantId, t.status),
    index("email_ingestion_accounts_tenant_idx").on(t.tenantId),
    index("email_ingestion_accounts_parser_rule_idx").on(t.expectedParserRuleId),
    index("email_ingestion_accounts_creator_idx").on(t.createdByUserId),
  ],
);

// ── Phase 13 batch 13d (migration 0034) — EMAIL STORAGE + PARSE SUBSTRATE (Group 2) ───
// The three storage/parse tables that depend on inbound_emails: the raw intake record
// (inbound_emails), its attachments (email_attachments), and the parser's structured
// output (email_parse_results). email_work_order_drafts is deliberately HELD for Group 3
// (its 9 FKs warrant an isolated migration). All tenant-scoped; FKs pre-named (WP-12.2).
//
// ⚠ WP-13.1: inbound_emails is a DISTINCT table from the Phase-6 inbound_messages
// (communication-log inbound channel rows). Different purpose, different lifecycle — do
// not conflate. inbound_emails is the raw mail-intake record the parser consumes.
//
// json columns (inbound_emails.raw_headers, email_parse_results.extracted_fields) become
// MariaDB longtext+json_valid and round-trip as RAW STRINGS on read — parse at the read
// boundary when a reader consumes them (CF-13.3; the billing/events.ts:153 precedent).

const processingStatusEnum = [
  "received",
  "parsed",
  "drafted",
  "failed",
  "duplicate_flagged", // OQ-13.4: a suspected-duplicate message held for operator adjudication.
] as const;

// ── inbound_emails (manifest §4.2) — FK → email_ingestion_accounts (Group 1) ──
export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    // SET NULL: preserve the intake record if its account binding is removed.
    ingestionAccountId: varchar("ingestion_account_id", { length: 36 }),
    // RFC822 Message-ID — the duplicate-DETECTION key (NOT a hard unique; see index below).
    messageId: varchar("message_id", { length: 255 }),
    fromAddress: varchar("from_address", { length: 255 }).notNull(),
    toAddress: varchar("to_address", { length: 255 }),
    subject: varchar("subject", { length: 998 }), // RFC-max subject length.
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    // json → longtext+json_valid; parse-at-read.
    rawHeaders: json("raw_headers"),
    receivedAt: timestamp("received_at"),
    processingStatus: mysqlEnum("processing_status", processingStatusEnum)
      .notNull()
      .default("received"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "ie_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.ingestionAccountId],
      foreignColumns: [emailIngestionAccounts.id],
      name: "ie_account_fk",
    }).onDelete("set null"),
    // ⚠⚠ OQ-13.4 flag-don't-reject: NON-UNIQUE index for duplicate-detection LOOKUP.
    // A uniqueIndex here would HARD-REJECT duplicates, inverting the locked decision —
    // a repeat message_id must be STORED and flagged (processing_status='duplicate_flagged'),
    // never rejected by the DB. This is load-bearing; keep it index(), NOT uniqueIndex().
    index("inbound_emails_tenant_message_idx").on(t.tenantId, t.messageId),
    index("inbound_emails_tenant_status_idx").on(t.tenantId, t.processingStatus),
    index("inbound_emails_tenant_idx").on(t.tenantId),
    index("inbound_emails_account_idx").on(t.ingestionAccountId),
  ],
);

// ── email_attachments (manifest §4.5) — FK → inbound_emails ──
export const emailAttachments = pgTable(
  "email_attachments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    inboundEmailId: varchar("inbound_email_id", { length: 36 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    sizeBytes: integer("size_bytes"),
    // Reference ONLY (OQ-13.2) — no in-DB blobs; the physical backend is CF-13.4.
    storageRef: varchar("storage_ref", { length: 512 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "eatt_tenant_fk",
    }).onDelete("cascade"),
    // CASCADE: attachments die with their parent email.
    foreignKey({
      columns: [t.inboundEmailId],
      foreignColumns: [inboundEmails.id],
      name: "eatt_email_fk",
    }).onDelete("cascade"),
    index("email_attachments_tenant_idx").on(t.tenantId),
    index("email_attachments_email_idx").on(t.inboundEmailId),
  ],
);

// ── email_parse_results (manifest §4.3) — FK → inbound_emails + email_parser_rules ──
const parserKindEnum = ["deterministic", "ai_assist"] as const;
const parseOutcomeEnum = ["parsed", "partial", "failed"] as const;

export const emailParseResults = pgTable(
  "email_parse_results",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    inboundEmailId: varchar("inbound_email_id", { length: 36 }).notNull(),
    parserKind: mysqlEnum("parser_kind", parserKindEnum).notNull(),
    matchedFormat: varchar("matched_format", { length: 128 }),
    // SET NULL: preserve the parse record if its rule is deleted.
    matchedRuleId: varchar("matched_rule_id", { length: 36 }),
    // CF-13.1 — continuous 0.0000–1.0000; stored precise so the future auto-create
    // threshold is a config change, not a schema change (the autonomy-enabling field).
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    // json → longtext+json_valid; parse-at-read.
    extractedFields: json("extracted_fields"),
    // Feeds the Phase-12 D-1 resolver (external_client_mappings). NOT a client FK — D-7
    // keeps client→id resolution in the one frozen resolver, never duplicated here.
    extractedClientCode: varchar("extracted_client_code", { length: 64 }),
    parseOutcome: mysqlEnum("parse_outcome", parseOutcomeEnum).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "epr_tenant_fk",
    }).onDelete("cascade"),
    // CASCADE: a parse result has no value without its source email.
    foreignKey({
      columns: [t.inboundEmailId],
      foreignColumns: [inboundEmails.id],
      name: "epr_email_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.matchedRuleId],
      foreignColumns: [emailParserRules.id],
      name: "epr_rule_fk",
    }).onDelete("set null"),
    index("email_parse_results_tenant_idx").on(t.tenantId),
    index("email_parse_results_email_idx").on(t.inboundEmailId),
    index("email_parse_results_rule_idx").on(t.matchedRuleId),
    index("email_parse_results_outcome_idx").on(t.tenantId, t.parseOutcome),
  ],
);

// ── Phase 13 batch 13e (migration 0035) — EMAIL WORK-ORDER DRAFT (Group 3) ────────────
// The reviewable draft before it becomes a job — the email analog of update_rewrite_drafts
// (the draft→review→publish lifecycle) plus the ingest "park" state (IF-7). Isolated in its
// own migration because it is the FK-heaviest table of the phase (9 FKs).
//
// DELETE-RULE DESIGN: only tenant + source email are HARD parents (CASCADE — a draft has no
// meaning without them). Every other reference (parse result, client, location, trade,
// priority, job, reviewer) is SET NULL: the draft is an AUDIT RECORD of what arrived, so
// deleting a referenced entity must NULL the link, never delete the draft.
//
// PARTIAL RESOLUTION (OQ-13.1/OQ-13.5): all resolved_* are NULLABLE — a partially-resolved
// draft is a 'pending_review' row with one or more resolved_* null. Partial is NOT a
// draft_status value; the asymmetry (location auto-stubs SF-2, client parks IF-7) is handled
// by the resolution layer, not the schema. created_job_id is set ONLY at approval (D-5).
//
// D-6: source_type is carried from the ingestion account onto the resulting job at approval.
// 9 FKs ALL pre-named (ewod_*) — this table is the one most at risk of >64-char auto-names.

const draftStatusEnum = [
  "pending_review",
  "approved",
  "rejected",
  "superseded",
] as const;

export const emailWorkOrderDrafts = pgTable(
  "email_work_order_drafts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    // CASCADE: a draft has no meaning without its source email (hard parent).
    inboundEmailId: varchar("inbound_email_id", { length: 36 }).notNull(),
    // SET NULL: the parse result is informational; the draft survives its loss.
    parseResultId: varchar("parse_result_id", { length: 36 }),
    draftStatus: mysqlEnum("draft_status", draftStatusEnum)
      .notNull()
      .default("pending_review"),
    // D-6: carried onto the job's source_type at approval.
    sourceType: mysqlEnum("source_type", sourceTypeEnum).notNull(),
    problemDescription: text("problem_description"),
    // ── resolved_* : ALL NULLABLE (partial resolution is the normal path) ──
    resolvedClientId: varchar("resolved_client_id", { length: 36 }),
    resolvedClientLocationId: varchar("resolved_client_location_id", { length: 36 }),
    resolvedTradeId: varchar("resolved_trade_id", { length: 36 }),
    resolvedPriorityId: varchar("resolved_priority_id", { length: 36 }),
    // ── outcome links ──
    createdJobId: varchar("created_job_id", { length: 36 }), // set only at approval (D-5).
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "ewod_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.inboundEmailId],
      foreignColumns: [inboundEmails.id],
      name: "ewod_email_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.parseResultId],
      foreignColumns: [emailParseResults.id],
      name: "ewod_parse_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.resolvedClientId],
      foreignColumns: [clients.id],
      name: "ewod_client_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.resolvedClientLocationId],
      foreignColumns: [clientLocations.id],
      name: "ewod_location_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.resolvedTradeId],
      foreignColumns: [trades.id],
      name: "ewod_trade_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.resolvedPriorityId],
      foreignColumns: [priorities.id],
      name: "ewod_priority_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.createdJobId],
      foreignColumns: [jobs.id],
      name: "ewod_job_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.reviewedByUserId],
      foreignColumns: [users.id],
      name: "ewod_reviewer_fk",
    }).onDelete("set null"),
    index("email_work_order_drafts_tenant_status_idx").on(t.tenantId, t.draftStatus),
    index("email_work_order_drafts_tenant_idx").on(t.tenantId),
    index("email_work_order_drafts_email_idx").on(t.inboundEmailId),
    index("email_work_order_drafts_parse_idx").on(t.parseResultId),
    index("email_work_order_drafts_client_idx").on(t.resolvedClientId),
    index("email_work_order_drafts_location_idx").on(t.resolvedClientLocationId),
    index("email_work_order_drafts_trade_idx").on(t.resolvedTradeId),
    index("email_work_order_drafts_priority_idx").on(t.resolvedPriorityId),
    index("email_work_order_drafts_job_idx").on(t.createdJobId),
    index("email_work_order_drafts_reviewer_idx").on(t.reviewedByUserId),
  ],
);
