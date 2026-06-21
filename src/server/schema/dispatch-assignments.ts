import {
  boolean,
  datetime,
  decimal,
  foreignKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { trades } from "./trades";
import { jobs } from "./jobs";
import { vendors, vendorLocations, vendorContacts } from "./vendors";
import { dispatchAssignmentStatuses } from "./dispatch-reference";

// Equality-match geo vocabulary, identical to vendor-matching.ts's GeoMatchType.
const geoMatchTypeEnum = ["postal_code", "city", "state", "national"] as const;

// Compliance posture at dispatch — a small CLOSED vocabulary, so an enum (like
// tightest_geo_at_dispatch), NOT varchar. The D-4.2 forward-flex argument is for
// genuinely-growing vocabularies (scope_generation_status, event_type); compliance
// is ~5 values. The matcher emits 'ok' / 'no_data' today (D-5.2); 'expired' /
// 'non_compliant' exist for when compliance data lands. Adding pending/under_review
// later is a one-line enum ALTER (D-4.4). DB-level typo rejection wins here.
const complianceStatusEnum = [
  "ok",
  "no_data",
  "expired",
  "non_compliant",
] as const;

// job_vendor_assignments — one row per (job, vendor) dispatch. A job supports
// MANY assignments (Phase 5 lock (c): NO (job,vendor) uniqueness — re-dispatch,
// multi-trade jobs, and comparing offers are all real). The "one active per
// (job,vendor)" rule, if ever wanted, is a createDispatch workflow guard, not a
// DB constraint.
//
// Lifecycle (R-5.x): createDispatch lands the row at DRAFT — assignment-only, no
// job-side status change and NO job_events row (a draft is operator workspace,
// not a job milestone). sendDispatch moves DRAFT → SENT and transitions the JOB
// to Dispatched on the first send from a non-Dispatched status (re-dispatch is a
// no-op on the job status; 'job.dispatched' fires every send).
//
// Dispatch-time snapshot (lock (e) + facet lock): dispatch_scope, agreed_nte_amount
// and the matcher facets (matched_trade_id / matched_trade_was_primary /
// tightest_geo_at_dispatch / matched_geo_types_at_dispatch /
// compliance_status_at_dispatch / chosen_branch_covered_trade) are captured at
// dispatch time by RE-DERIVING the matcher server-side at submit
// (VENDOR_NO_LONGER_CANDIDATE if the vendor has dropped out since form load). They
// are immutable thereafter — the job's own scope/trade keep evolving (Phase 6/7);
// changing a sent dispatch's scope is a Phase 8 change order.
//
// FKs carry explicit short `jva_` names: Drizzle's auto-generated
// {table}_{col}_{ref}_{refcol}_fk names overrun MySQL's 64-char limit on this
// table (see check-migration-identifiers.mjs).
export const jobVendorAssignments = mysqlTable(
  "job_vendor_assignments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    // Nullable: a dispatch may target the vendor org as a whole (no specific
    // branch). RESTRICT when set (lock (b)).
    vendorLocationId: varchar("vendor_location_id", { length: 36 }),
    // The coordination contact for this dispatch; SET NULL on delete so contact
    // management is never blocked by an existing dispatch.
    vendorContactId: varchar("vendor_contact_id", { length: 36 }),
    currentStatusId: varchar("current_status_id", { length: 36 }).notNull(),
    // NTE and DNE are practical synonyms in this domain — one field (lock (d)).
    agreedNteAmount: decimal("agreed_nte_amount", { precision: 12, scale: 2 }),
    scheduledStartAt: datetime("scheduled_start_at"),
    scheduledEndAt: datetime("scheduled_end_at"),
    // Immutable snapshot of the job's scope at dispatch time (lock (e)).
    dispatchScope: text("dispatch_scope"),
    // --- matcher facet snapshot (re-derived server-side at dispatch) ---
    // Snapshot: equal to jobs.primary_trade_id at dispatch time but immutable
    // thereafter (defensive against future trade-change workflows).
    matchedTradeId: varchar("matched_trade_id", { length: 36 }).notNull(),
    matchedTradeWasPrimary: boolean("matched_trade_was_primary").notNull(),
    tightestGeoAtDispatch: mysqlEnum(
      "tightest_geo_at_dispatch",
      geoMatchTypeEnum,
    ).notNull(),
    matchedGeoTypesAtDispatch: json("matched_geo_types_at_dispatch").notNull(),
    complianceStatusAtDispatch: mysqlEnum(
      "compliance_status_at_dispatch",
      complianceStatusEnum,
    ).notNull(),
    // Nullable: only meaningful when a branch was chosen (vendor_location_id set).
    // true if that branch carries its own active coverage for the matched trade.
    chosenBranchCoveredTrade: boolean("chosen_branch_covered_trade"),
    // Set by sendDispatch when the dispatch transitions DRAFT → SENT.
    sentAt: datetime("sent_at"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    // Phase 28: a re-dispatch DRAFT points at the stuck assignment it replaces (self-FK).
    // Null for a normal/first dispatch; set only on a re-dispatch suggestion DRAFT.
    replacesAssignmentId: varchar("replaces_assignment_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "jva_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.jobId],
      foreignColumns: [jobs.id],
      name: "jva_job_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.vendorId],
      foreignColumns: [vendors.id],
      name: "jva_vendor_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.vendorLocationId],
      foreignColumns: [vendorLocations.id],
      name: "jva_vendor_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.vendorContactId],
      foreignColumns: [vendorContacts.id],
      name: "jva_vendor_contact_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.currentStatusId],
      foreignColumns: [dispatchAssignmentStatuses.id],
      name: "jva_status_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.matchedTradeId],
      foreignColumns: [trades.id],
      name: "jva_trade_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
      name: "jva_creator_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.replacesAssignmentId],
      foreignColumns: [t.id],
      name: "jva_replaces_fk",
    }).onDelete("set null"),
    index("jva_tenant_job_idx").on(t.tenantId, t.jobId),
    index("jva_tenant_vendor_idx").on(t.tenantId, t.vendorId),
    index("jva_tenant_status_idx").on(t.tenantId, t.currentStatusId),
    index("jva_replaces_idx").on(t.replacesAssignmentId),
  ],
);

// Append-only typed transition log for an assignment's status — mirrors
// job_status_history exactly. First row: from_status_id = null → to (DRAFT),
// changed_by = creator (R-4.x convention). This is the assignment's authoritative
// transition audit; the job-side timeline ('job.dispatched') and dispatch_messages
// are separate streams.
export const jobVendorAssignmentStatusHistory = mysqlTable(
  "job_vendor_assignment_status_history",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    fromStatusId: varchar("from_status_id", { length: 36 }),
    toStatusId: varchar("to_status_id", { length: 36 }).notNull(),
    changedByUserId: varchar("changed_by_user_id", { length: 36 }),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "jvash_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.assignmentId],
      foreignColumns: [jobVendorAssignments.id],
      name: "jvash_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.fromStatusId],
      foreignColumns: [dispatchAssignmentStatuses.id],
      name: "jvash_from_status_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.toStatusId],
      foreignColumns: [dispatchAssignmentStatuses.id],
      name: "jvash_to_status_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.changedByUserId],
      foreignColumns: [users.id],
      name: "jvash_changed_by_fk",
    }).onDelete("set null"),
    index("jvash_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);
