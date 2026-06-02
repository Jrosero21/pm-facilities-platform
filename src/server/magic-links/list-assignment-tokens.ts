import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { magicLinkTokens } from "@/server/schema";

// ── Phase 21 — TOKEN LIST (operator revoke surface) ───────────────────────────────────
// Lists an assignment's magic-link tokens for the operator's revoke control. Tenant+assignment
// scoped, newest first. NEVER selects token_hash (the hash is write-only — nothing reads it back
// except resolve's lookup). State is derived in app from revoked_at / expires_at / sent_at.

export type MagicLinkTokenState = "active" | "revoked" | "expired" | "unsent";

export type AssignmentTokenListItem = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  sentAt: Date | null;
  state: MagicLinkTokenState;
};

function deriveState(row: { expiresAt: Date; revokedAt: Date | null; sentAt: Date | null }): MagicLinkTokenState {
  if (row.revokedAt !== null) return "revoked";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  if (row.sentAt === null) return "unsent";
  return "active";
}

export async function listAssignmentTokens(
  tenantId: string,
  assignmentId: string,
): Promise<AssignmentTokenListItem[]> {
  const rows = await db
    .select({
      id: magicLinkTokens.id,
      createdAt: magicLinkTokens.createdAt,
      expiresAt: magicLinkTokens.expiresAt,
      revokedAt: magicLinkTokens.revokedAt,
      sentAt: magicLinkTokens.sentAt,
    })
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.tenantId, tenantId), eq(magicLinkTokens.assignmentId, assignmentId)))
    .orderBy(desc(magicLinkTokens.createdAt));

  return rows.map((r) => ({ ...r, state: deriveState(r) }));
}
