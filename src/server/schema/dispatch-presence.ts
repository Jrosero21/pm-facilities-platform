import {
  datetime,
  foreignKey,
  index,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobVendorAssignments } from "./dispatch-assignments";

// vendor_eta_confirmations — append-only ETA log (lock (g)). The latest row by
// created_at is the CURRENT ETA; prior rows are the schedule audit trail (same
// append-only pattern as job_status_history). eta_start_at is the committed
// arrival; eta_end_at the optional window end.
export const vendorEtaConfirmations = mysqlTable(
  "vendor_eta_confirmations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    etaStartAt: datetime("eta_start_at").notNull(),
    etaEndAt: datetime("eta_end_at"),
    note: varchar("note", { length: 500 }),
    confirmedByUserId: varchar("confirmed_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "vec_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.assignmentId],
      foreignColumns: [jobVendorAssignments.id],
      name: "vec_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.confirmedByUserId],
      foreignColumns: [users.id],
      name: "vec_confirmed_by_fk",
    }).onDelete("set null"),
    index("vec_assignment_created_idx").on(t.assignmentId, t.createdAt),
    index("vec_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);

// vendor_check_ins / vendor_check_outs — operator-recorded presence events
// (lock (h)). Two tables with INTENTIONALLY IDENTICAL schemas for v1: the roadmap
// §8 lists them separately and there is no reason to override that now. Divergent
// columns (work_summary / signature / parts_used on check-outs) are NOT added
// preemptively — they arrive when real divergence does (Phase 6/8). occurred_at is
// when the vendor arrived/left; created_at is when the operator recorded it.
export const vendorCheckIns = mysqlTable(
  "vendor_check_ins",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    occurredAt: datetime("occurred_at").notNull(),
    note: varchar("note", { length: 500 }),
    recordedByUserId: varchar("recorded_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "vci_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.assignmentId],
      foreignColumns: [jobVendorAssignments.id],
      name: "vci_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.recordedByUserId],
      foreignColumns: [users.id],
      name: "vci_recorded_by_fk",
    }).onDelete("set null"),
    index("vci_assignment_occurred_idx").on(t.assignmentId, t.occurredAt),
    index("vci_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);

export const vendorCheckOuts = mysqlTable(
  "vendor_check_outs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    occurredAt: datetime("occurred_at").notNull(),
    note: varchar("note", { length: 500 }),
    recordedByUserId: varchar("recorded_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "vco_tenant_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.assignmentId],
      foreignColumns: [jobVendorAssignments.id],
      name: "vco_assignment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.recordedByUserId],
      foreignColumns: [users.id],
      name: "vco_recorded_by_fk",
    }).onDelete("set null"),
    index("vco_assignment_occurred_idx").on(t.assignmentId, t.occurredAt),
    index("vco_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);
