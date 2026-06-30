import {
  timestamp,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { entityStatus, portalUpdatesQueueStatus, portalUpdatesTargetPortal } from "./enums";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { vendors } from "./vendors";



// ── Phase 6 batch 6f — STRUCTURAL FORWARD-DECLS ONLY ─────────────────────────────────
// These two tables are roadmap §8 Phase 6 core tables, created now for completeness, but
// they have NO Phase 6 writer, no data layer, and no UI. They are activated later:
//   vendor_update_logs  → Phase 10 (vendor portal submits updates)
//   portal_update_queue → Phase 12 / Phase 13 (client portal push + send pipeline)
// The column shapes below are coherent forward-decls; the activating phase may refine
// them (the tables stay empty until then, so ALTERs are low-risk). They intentionally
// follow the 6d unifying-log conventions (uuid v7 PK, tenant cascade, status enum,
// created/updated timestamps, short FK prefixes, polymorphic source_type+source_id).
// "Basic update queue concept" (a Phase 6 deliverable) is realized in Phase 6 by the
// rewriter draft queue (update_rewrite_drafts at pending_review, 6g.a); this is its
// eventual portal-push home. See 6h L-6.x.

// vendor_update_logs — the vendor-origin update ledger. The inbound mirror of
// client_update_logs (6g.a): when a vendor submits an update on a job (Phase 10 portal),
// it lands here. Per LOCK 1, Phase 10+ can register vendor_update as a polymorphic
// rewriter input source via the same source_type+source_id contract — no rewriter
// redesign. No Phase 6 writer.
export const vendorUpdateLogs = pgTable(
  "vendor_update_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }),
    content: text("content").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    status: entityStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "vul_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "vul_job_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.vendorId], foreignColumns: [vendors.id], name: "vul_vendor_fk" }).onDelete("set null"),
    index("vul_tenant_job_idx").on(t.tenantId, t.jobId),
  ],
);

// portal_update_queue — the outbound portal-push queue. When the platform needs to push
// an update to a client/vendor/external portal, it enqueues here; a Phase 12/13 processor
// drains it. `source_type`+`source_id` is the polymorphic pointer to the content being
// pushed (e.g. client_update → client_update_logs row), consistent with
// communication_logs (6d). No FK on the source (spans tables). No Phase 6 writer.
export const portalUpdateQueue = pgTable(
  "portal_update_queue",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    jobId: varchar("job_id", { length: 36 }).notNull(),
    targetPortal: portalUpdatesTargetPortal("target_portal").notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    queueStatus: portalUpdatesQueueStatus("queue_status")
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    scheduledAt: timestamp("scheduled_at"),
    processedAt: timestamp("processed_at"),
    lastError: text("last_error"),
    status: entityStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "puq_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.jobId], foreignColumns: [jobs.id], name: "puq_job_fk" }).onDelete("cascade"),
    index("puq_tenant_status_idx").on(t.tenantId, t.queueStatus),
    index("puq_source_idx").on(t.sourceType, t.sourceId),
  ],
);
