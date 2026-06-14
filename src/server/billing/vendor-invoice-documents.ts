import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { jobAttachments } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";
import { getStorageProvider } from "@/lib/integrations/storage";
import { documentExt } from "@/lib/integrations/storage/document-mime";
import { getVendorInvoice } from "@/server/billing/vendor-invoices";

// ── Phase (iii) Part 1 — vendor-invoice DOCUMENT attachments (operator) ─────────────────
// Operators attach documents (PDF/scan/sign-off/receipt) to a vendor invoice. Each doc is a
// job_attachments row linked via vendor_invoice_id (0051), tagged by attachment_type, stored in
// object storage (put-before-insert, mirroring create-vendor-photo-placeholder.ts). visibility stays
// internal_only (v1; the cost-plus-client-entitlement exposure is a later, Part-3/portal concern).
// The Part-3 cost-plus gate will check: EXISTS a doc here with attachment_type='invoice'.

// The job_attachments.attachment_type enum (derived from the model — do not redefine).
type AttachmentType = NonNullable<typeof jobAttachments.$inferInsert["attachmentType"]>;

// The operator-facing UI tag → the stored attachment_type enum. The Part-3 gate keys on 'invoice'.
// (receipt → document, sign-off → signature: there is no dedicated enum value for those.)
export const DOCUMENT_TAGS = ["invoice", "signoff", "receipt", "photo", "other"] as const;
export type DocumentTag = (typeof DOCUMENT_TAGS)[number];
const TAG_TO_ATTACHMENT_TYPE: Readonly<Record<DocumentTag, AttachmentType>> = {
  invoice: "invoice",
  signoff: "signature",
  receipt: "document",
  photo: "photo",
  other: "other",
};

/**
 * Attach an uploaded document to a vendor invoice (operator). Confirms the invoice belongs to the
 * tenant (and reads its jobId), then PUT-before-INSERT: storage put first, the job_attachments row
 * only on success (a failed put writes NO row — the safe residue is an orphan object, not a row).
 * Throws VENDOR_INVOICE_NOT_FOUND, STORAGE_PUT_FAILED. The action layer enforces the MIME/size gate.
 */
export async function attachVendorInvoiceDocument(input: {
  tenantId: string;
  vendorInvoiceId: string;
  tag: DocumentTag;
  bytes: Buffer;
  contentType: string;
  fileName: string;
  uploadedByUserId: string;
}): Promise<{ id: string }> {
  const inv = await getVendorInvoice(input.tenantId, input.vendorInvoiceId);
  if (!inv) throw new Error("VENDOR_INVOICE_NOT_FOUND");

  const attachmentType = TAG_TO_ATTACHMENT_TYPE[input.tag];
  const attachmentId = uuidv7();
  const ext = documentExt(input.contentType, input.fileName);
  const key = `tenant/${input.tenantId}/job/${inv.jobId}/attachment/${attachmentId}.${ext}`;

  const provider = getStorageProvider();
  const put = await provider.put({ key, bytes: input.bytes, contentType: input.contentType });
  if (!put.ok) throw new Error("STORAGE_PUT_FAILED"); // no row on a failed put

  const title = (input.fileName.trim() || "Document").slice(0, 255);
  await db.insert(jobAttachments).values({
    id: attachmentId,
    tenantId: input.tenantId,
    jobId: inv.jobId,
    vendorInvoiceId: input.vendorInvoiceId, // the 0051 link — many docs → one vendor invoice
    title,
    attachmentType,
    visibility: "internal_only",
    uploadedByUserId: input.uploadedByUserId,
    storageKey: key,
    checksum: put.checksum,
    storageProvider: provider.name,
    fileSizeBytes: put.size,
    fileMimeType: input.contentType,
    fileUrl: null, // served via presigned URL from storage_key
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.uploadedByUserId,
    action: "job_attachment.uploaded",
    targetType: "job_attachment",
    targetId: attachmentId,
    metadata: {
      jobId: inv.jobId,
      vendorInvoiceId: input.vendorInvoiceId,
      attachmentType,
      tag: input.tag,
      size: put.size,
      mime: input.contentType,
      checksum: put.checksum,
      storageProvider: provider.name,
      actor: "operator",
    },
  });

  return { id: attachmentId };
}

export type VendorInvoiceDocumentRow = {
  id: string;
  title: string;
  attachmentType: AttachmentType;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  hasFile: boolean;
  createdAt: Date;
};

/** List the active documents attached to a vendor invoice (tenant-scoped), newest first. */
export async function listVendorInvoiceDocuments(
  tenantId: string,
  vendorInvoiceId: string,
): Promise<VendorInvoiceDocumentRow[]> {
  const rows = await db
    .select({
      id: jobAttachments.id,
      title: jobAttachments.title,
      attachmentType: jobAttachments.attachmentType,
      fileMimeType: jobAttachments.fileMimeType,
      fileSizeBytes: jobAttachments.fileSizeBytes,
      storageKey: jobAttachments.storageKey,
      createdAt: jobAttachments.createdAt,
    })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.tenantId, tenantId),
        eq(jobAttachments.vendorInvoiceId, vendorInvoiceId),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .orderBy(desc(jobAttachments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    attachmentType: r.attachmentType,
    fileMimeType: r.fileMimeType,
    fileSizeBytes: r.fileSizeBytes,
    hasFile: r.storageKey != null,
    createdAt: r.createdAt,
  }));
}

export type VendorInvoiceDocumentUrlResult =
  | { kind: "url"; url: string; expiresInSeconds: number }
  | { kind: "placeholder" }
  | { kind: "unavailable" }
  | { kind: "forbidden" };

/**
 * Presign a time-limited READ url for ONE document attached to a vendor invoice. TENANT-scoped (not
 * author-scoped, unlike the vendor reader): an operator may serve any document on an invoice in their
 * tenant, but only one actually linked to THIS vendor_invoice_id (so arbitrary attachment ids can't be
 * probed). Missing/out-of-scope → 'forbidden' (existence not leaked); no bytes yet → 'placeholder'.
 */
export async function getVendorInvoiceDocumentUrl(input: {
  tenantId: string;
  vendorInvoiceId: string;
  attachmentId: string;
}): Promise<VendorInvoiceDocumentUrlResult> {
  const rows = await db
    .select({ storageKey: jobAttachments.storageKey })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.id, input.attachmentId),
        eq(jobAttachments.tenantId, input.tenantId),
        eq(jobAttachments.vendorInvoiceId, input.vendorInvoiceId),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { kind: "forbidden" };
  if (!row.storageKey) return { kind: "placeholder" };

  const signed = await getStorageProvider().getSignedUrl(row.storageKey);
  if (!signed.ok) return { kind: "unavailable" };
  return { kind: "url", url: signed.url, expiresInSeconds: signed.expiresInSeconds };
}
