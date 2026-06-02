import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { jobNotes, jobAttachments } from "@/server/schema";
import { getStorageProvider } from "@/lib/integrations/storage";

// ── Phase 21 — LINK-SURFACE READS (token-scoped, NOT author-scoped) ───────────────────
// A linkless (no-account) vendor has NO users row, so the Phase-20 author-scope readers
// (uploaded_by/created_by IN vendor_users) would hide their NULL-author rows AND can't run
// token-side. Instead these read by PROVENANCE: source_token_id = the resolved token id. That
// shows the linkless vendor ONLY what came through their own link — preserving the Phase-20
// cross-vendor isolation on a shared job (vendor A's token never sees vendor B's rows, because
// each row carries the token that created it). Tenant-scoped + non-archived.

export async function listLinkNotes(tenantId: string, tokenId: string) {
  return db
    .select({ id: jobNotes.id, body: jobNotes.body, createdAt: jobNotes.createdAt })
    .from(jobNotes)
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.sourceTokenId, tokenId),
        ne(jobNotes.status, "archived"),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}

export async function listLinkAttachments(tenantId: string, tokenId: string) {
  return db
    .select({
      id: jobAttachments.id,
      title: jobAttachments.title,
      storageKey: jobAttachments.storageKey,
      createdAt: jobAttachments.createdAt,
    })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.tenantId, tenantId),
        eq(jobAttachments.sourceTokenId, tokenId),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .orderBy(desc(jobAttachments.createdAt));
}

export type LinkAttachmentUrl =
  | { kind: "url"; url: string; expiresInSeconds: number }
  | { kind: "placeholder" }
  | { kind: "unavailable" }
  | { kind: "forbidden" };

/**
 * Presign a read URL for one attachment, gated on source_token_id === the resolved token id
 * (NOT author-scope, NOT bare job-scope). A row that wasn't created via this token → 'forbidden'
 * (indistinguishable from missing — no existence leak), so one token can never presign another
 * vendor's photo on a shared job.
 */
export async function getLinklessAttachmentUrl(
  tenantId: string,
  attachmentId: string,
  tokenId: string,
): Promise<LinkAttachmentUrl> {
  const rows = await db
    .select({ storageKey: jobAttachments.storageKey })
    .from(jobAttachments)
    .where(
      and(
        eq(jobAttachments.id, attachmentId),
        eq(jobAttachments.tenantId, tenantId),
        eq(jobAttachments.sourceTokenId, tokenId),
        ne(jobAttachments.status, "archived"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return { kind: "forbidden" }; // missing OR not-this-token's → same result
  if (!row.storageKey) return { kind: "placeholder" };

  const signed = await getStorageProvider().getSignedUrl(row.storageKey);
  if (!signed.ok) return { kind: "unavailable" };
  return { kind: "url", url: signed.url, expiresInSeconds: signed.expiresInSeconds };
}
