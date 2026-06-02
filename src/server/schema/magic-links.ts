import {
  datetime,
  foreignKey,
  index,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./tenants";
import { users } from "./auth";
import { jobVendorAssignments } from "./dispatch-assignments";

// ── Phase 21 (0044) — MAGIC-LINK TOKENS ───────────────────────────────────────────────
// Linkless vendor access: a signed link bound to ONE job_vendor_assignment lets an
// unregistered vendor update that assignment with no account. Token scheme B (stored opaque
// token): the row stores a SHA-256 HASH of the random token (NEVER the raw value — the link
// carries the raw token; the server hashes-and-looks-up). Revocable (revoked_at), expiring
// (expires_at), single-assignment-scoped (assignment_id), and the idempotency home for link
// delivery (sent_at) — invariant 6. A tampered/forged token matches no stored hash → "not
// found" (no existence leak, mirroring Phase-20). FKs pre-named (WP-12.2).
export const magicLinkTokens = mysqlTable(
  "magic_link_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull(),
    // sha256(rawToken) hex = 64 chars. The raw token is never stored.
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    revokedAt: datetime("revoked_at"),
    sentAt: datetime("sent_at"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId], foreignColumns: [tenants.id], name: "mlt_tenant_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.assignmentId], foreignColumns: [jobVendorAssignments.id], name: "mlt_assignment_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.createdByUserId], foreignColumns: [users.id], name: "mlt_created_by_fk" }).onDelete("set null"),
    uniqueIndex("mlt_token_hash_unique").on(t.tokenHash),
    index("mlt_tenant_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);
