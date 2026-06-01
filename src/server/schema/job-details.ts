import {
  bigint,
  boolean,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { users } from "./auth";
import { tenants } from "./tenants";
import { jobs } from "./jobs";

const statusEnum = ["active", "inactive", "archived"] as const;

// Visibility for anything an operator adds to a job that might eventually be
// shared externally. Phase 4 UI only ever sets internal_only; Phase 6 expands the
// picker + visibility-control workflows. Landing the column now avoids a backfill
// on populated tables (D-4.4-vis). The same column forward-points to Phase 5's
// dispatch_messages and Phase 6's communication tables.
const visibilityEnum = [
  "internal_only",
  "vendor_visible",
  "client_visible",
  "client_and_vendor_visible",
  "requires_review",
] as const;

// Contacts attached to a job. Mirrors vendor_contacts / client_contacts; reuses
// the generalized ContactForm / ContactList (SOP-3.E).
export const jobContacts = mysqlTable(
  "job_contacts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 128 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("job_contacts_tenant_job_idx").on(t.tenantId, t.jobId)],
);

// Operator notes on a job. `visibility` is the forward-pointer column (Phase 4 UI
// sets internal_only only). `status` is soft-delete (a note can be hidden later).
export const jobNotes = mysqlTable(
  "job_notes",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    visibility: mysqlEnum("visibility", visibilityEnum)
      .notNull()
      .default("internal_only"),
    // Provenance discriminator (Phase 10 Fork 4). varchar (NOT enum) by lock:
    // the two MVP values 'operator'/'vendor' are app-enforced, and future origins
    // ('client', 'system') grow without a migration. DEFAULT 'operator' is correct
    // for all pre-Phase-10 rows (no vendor portal existed — DoR-10b.2).
    origin: varchar("origin", { length: 16 }).notNull().default("operator"),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("job_notes_tenant_job_idx").on(t.tenantId, t.jobId)],
);

// Job attachments. Schema-only in Phase 4 (no upload UI; file-upload infra still
// deferred — Phase 3 L-3.2). Mirrors vendor_documents; carries `visibility` for
// the same Phase 6 reason as job_notes. file_url/size/mime stay null until infra.
export const jobAttachments = mysqlTable(
  "job_attachments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 36 })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    attachmentType: mysqlEnum("attachment_type", [
      "photo",
      "document",
      "signature",
      "invoice",
      "quote",
      "other",
    ])
      .notNull()
      .default("other"),
    fileUrl: varchar("file_url", { length: 1024 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileMimeType: varchar("file_mime_type", { length: 127 }),
    // Phase 20 (0043) — real-bytes object-storage tracking. Additive, nullable; the upload
    // path writes storage_key (the object key) + checksum (sha256) + storage_provider on a
    // real upload. storage_key NULL is the new placeholder marker (existing rows stay valid
    // placeholders). No FK.
    storageKey: varchar("storage_key", { length: 1024 }),
    checksum: varchar("checksum", { length: 255 }),
    storageProvider: varchar("storage_provider", { length: 32 }),
    visibility: mysqlEnum("visibility", visibilityEnum)
      .notNull()
      .default("internal_only"),
    uploadedByUserId: varchar("uploaded_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    status: mysqlEnum("status", statusEnum).notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("job_attachments_tenant_job_idx").on(t.tenantId, t.jobId)],
);
