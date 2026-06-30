import {
  timestamp,
  numeric,
  foreignKey,
  index,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { proposals } from "./proposals";
import { trades } from "./trades";
import { arMarkupColumns, baseLineItemColumns } from "./billing-shared";

// ── Phase 8 batch 8b (migration 0019) — CHANGE ORDERS (#12/#13) ──────────────────────
// Job-anchored (job_id NN — the durable operational anchor, Phase 5 forward pointer) with
// an OPTIONAL proposal_id (set when the CO revises a specific accepted proposal). A CO
// records its scope/price DELTA on itself (scope_delta_snapshot + its line items); an
// approved CO does NOT mutate job_scope_steps / jobs.approved_scope_of_work (R-7.2) and
// does NOT edit the proposal (#13). Effective NTE = jobs.not_to_exceed_amount + Σ approved
// CO amounts, computed-on-read (OQ-14) — no write to jobs.not_to_exceed_amount.
//
// status has NO `superseded` (8b-D5): COs stack as forward deltas, not revisions — the
// vocabulary deliberately differs from proposals (`submitted` vs `sent`; no supersession).
// Recorded in 02-decisions at closeout. Totals owned by recalculateChangeOrderTotals (8c).
const changeOrderStatusEnum = [
  "draft",
  "submitted",
  "approved",
  "declined",
  "withdrawn",
] as const;

export const changeOrders = pgTable(
  "change_orders",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    proposalId: varchar("proposal_id", { length: 36 }),
    status: mysqlEnum("status", changeOrderStatusEnum).notNull().default("draft"),
    scopeDeltaSnapshot: text("scope_delta_snapshot"),
    reason: text("reason"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    markupTotal: numeric("markup_total", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "co_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "co_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.proposalId], foreignColumns: [proposals.id], name: "co_proposal_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "co_created_by_fk" }).onDelete("set null"),
    index("co_tenant_job_idx").on(t.tenantId, t.jobId),
    index("co_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

// Base + AR-markup (8b-D4). Totals writer-owned (recalculateChangeOrderTotals).
// Phase (ii) billing-from-rates (0050) — labor-rate PROVENANCE (AR-only). trade_id/rate_type
// record which client_rates row a labor line's unit_price was resolved from; both NULLABLE
// (materials/operator-authored lines carry neither). NOT on vendor (AP) lines — cost side.
export const changeOrderLineItems = pgTable(
  "change_order_line_items",
  {
    ...baseLineItemColumns(),
    ...arMarkupColumns(),
    tradeId: varchar("trade_id", { length: 36 }),
    rateType: mysqlEnum("rate_type", [
      "hourly",
      "flat",
      "trip_charge",
      "per_unit",
      "emergency",
      "after_hours",
    ]),
    changeOrderId: varchar("change_order_id", { length: 36 }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "coli_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.changeOrderId], foreignColumns: [changeOrders.id], name: "coli_co_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.tradeId], foreignColumns: [trades.id], name: "coli_trade_fk" }).onDelete("restrict"),
    index("coli_tenant_co_idx").on(t.tenantId, t.changeOrderId),
  ],
);

// Parallel to proposal_approvals (OQ-13) — identical shape, separate table. Append-only.
const coApprovalDecisionEnum = ["accepted", "declined"] as const;

export const changeOrderApprovals = pgTable(
  "change_order_approvals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    changeOrderId: varchar("change_order_id", { length: 36 }).notNull(),
    decision: mysqlEnum("decision", coApprovalDecisionEnum).notNull(),
    approverUserId: varchar("approver_user_id", { length: 36 }),
    approverName: varchar("approver_name", { length: 255 }),
    decidedAt: timestamp("decided_at").notNull(),
    notes: text("notes"),
    signatureRef: varchar("signature_ref", { length: 1024 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "coapp_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.changeOrderId], foreignColumns: [changeOrders.id], name: "coapp_co_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.approverUserId], foreignColumns: [users.id], name: "coapp_user_fk" }).onDelete("set null"),
    index("coapp_tenant_co_idx").on(t.tenantId, t.changeOrderId),
  ],
);
