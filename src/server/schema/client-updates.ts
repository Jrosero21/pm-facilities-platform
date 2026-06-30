import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { mysqlEnum } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobs } from "./jobs";
import { updateRewriteDrafts } from "./agents-rewriter";

// ── Phase 6 batch 6g.a — UPDATE ENGINE OUTPUT ────────────────────────────────────────
// client_update_logs — the published client-facing update (the rewriter's OUTPUT target,
// per LOCK 1: input pluralism, single output channel). The active sibling of
// vendor_update_logs (6f, forward-decl). When an approved rewrite draft is published, the
// publish action writes a client_update_logs row (content = edited_content ?? draft_content)
// AND a communication_logs spine row (source_type='client_update', source_id=this.id,
// channel='client_portal', visibility='client_visible'). `source_draft_id` is the
// provenance link back to the rewrite draft — NULLABLE because non-rewriter client
// updates (operator-composed) may land here later. Operational content → keeps the
// soft-delete status enum (unlike the immutable audit substrate).
export const clientUpdateLogs = pgTable(
  "client_update_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    content: text("content").notNull(),
    sourceDraftId: varchar("source_draft_id", { length: 36 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    status: mysqlEnum("status", ["active", "inactive", "archived"]).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "cul_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "cul_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.sourceDraftId], foreignColumns: [updateRewriteDrafts.id], name: "cul_source_draft_fk" }).onDelete("set null"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "cul_created_by_fk" }).onDelete("set null"),
    index("cul_tenant_job_idx").on(t.tenantId, t.jobId),
  ],
);
