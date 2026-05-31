import {
  foreignKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";

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
export const emailParserRules = mysqlTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
export const emailIngestionAccounts = mysqlTable(
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
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
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
