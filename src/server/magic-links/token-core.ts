import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { magicLinkTokens } from "@/server/schema";

// ── Phase 21 — MAGIC-LINK TOKEN CORE (the security heart) ─────────────────────────────
// Token scheme B (stored opaque token): a high-entropy random token goes in the link; ONLY
// its SHA-256 hash is persisted (token_hash). The raw token is returned exactly once at mint
// and is UNRECOVERABLE from the DB — a DB read leak yields only hashes, not usable links.
// resolve() returns a SINGLE indistinguishable {ok:false} for missing / forged / tampered /
// expired / revoked (no reason-branching, no logging of which failed, no throw) — the
// Phase-20 no-existence-leak posture. revoke() is tenant-scoped and idempotent.

/** sha256 hex of a string. The only thing about a token that ever touches the DB. */
function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export type MagicLinkResolution =
  | { ok: true; tokenId: string; tenantId: string; assignmentId: string }
  | { ok: false };

/**
 * Mint a magic-link token bound to one assignment. Returns the rawToken ONCE — it is never
 * stored (only sha256(rawToken) is) and must never be logged; it exists only to build the link.
 */
export async function mintToken(input: {
  tenantId: string;
  assignmentId: string;
  expiresInSeconds: number;
  createdByUserId?: string | null;
}): Promise<{ tokenId: string; rawToken: string }> {
  const rawToken = randomBytes(32).toString("hex"); // 64-char hex — the value placed in the link
  const tokenHash = sha256hex(rawToken);
  const tokenId = uuidv7();

  await db.insert(magicLinkTokens).values({
    id: tokenId,
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    tokenHash,
    expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    revokedAt: null,
    sentAt: null,
    createdByUserId: input.createdByUserId ?? null,
  });

  return { tokenId, rawToken }; // rawToken returned once; never persisted, never logged
}

/**
 * Resolve a raw token to its assignment context, or a single quiet failure. Hash-and-lookup;
 * one {ok:false} for ALL of: no row (forged/tampered), revoked, or expired. Never branches by
 * reason, never logs the reason, never throws on a bad token.
 */
export async function resolveMagicLinkToken(rawToken: string): Promise<MagicLinkResolution> {
  const tokenHash = sha256hex(rawToken);
  const rows = await db
    .select({
      id: magicLinkTokens.id,
      tenantId: magicLinkTokens.tenantId,
      assignmentId: magicLinkTokens.assignmentId,
      expiresAt: magicLinkTokens.expiresAt,
      revokedAt: magicLinkTokens.revokedAt,
    })
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  // ONE indistinguishable failure: missing/forged/tampered, revoked, or expired.
  if (!row || row.revokedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false };
  }
  return { ok: true, tokenId: row.id, tenantId: row.tenantId, assignmentId: row.assignmentId };
}

/**
 * Revoke a token. Tenant-scoped (one tenant cannot revoke another's token) and idempotent:
 * the `revoked_at IS NULL` guard in the WHERE means only an un-revoked, in-tenant row matches —
 * so affectedRows is 1 exactly when this call newly revoked it, 0 if already-revoked / missing /
 * cross-tenant. (Mirrors the billing affectedRows-on-IS-NULL idempotency pattern.)
 */
export async function revokeToken(input: {
  tokenId: string;
  tenantId: string;
}): Promise<{ revoked: boolean }> {
  const res = await db
    .update(magicLinkTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(magicLinkTokens.id, input.tokenId),
        eq(magicLinkTokens.tenantId, input.tenantId),
        isNull(magicLinkTokens.revokedAt),
      ),
    );
  return { revoked: res.rowCount === 1 };
}
