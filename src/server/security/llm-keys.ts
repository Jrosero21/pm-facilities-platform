import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { tenantLlmKeys } from "@/server/schema";
import { encryptSecret, decryptSecret, KEY_REF } from "./secret-crypto";

// ── Phase 28 / CF-23.1 (K2) — TENANT LLM KEY resolution + setter ───────────────────────
// resolveLlmKey returns a tenant's decrypted key when they have an active one, else null = the
// caller uses the platform env key (backward-compatible: no tenant key = exactly today's behavior).
// SAFETY (locked): a tenant key that fails to decrypt (corrupted blob OR a rotated/wrong/missing
// SECRET_ENCRYPTION_KEY) falls back to the platform key — but NOT silently: a tagged console.error
// fires and tenantKeyError is set, so the misconfig surfaces. (A missing SECRET_ENCRYPTION_KEY makes
// decryptSecret throw on EVERY tenant key → every tenant with a key falls back + flags. That is the
// correct fail-closed posture.) NEVER logs the key, the plaintext, or the ciphertext blob.

export type LlmProvider = "anthropic" | "openai";

export type ResolvedLlmKey = {
  /** The decrypted tenant key, or null = the caller uses the platform env key. */
  key: string | null;
  source: "tenant" | "platform";
  /** Set when a tenant key existed but failed to decrypt (loud-flag for the run record). */
  tenantKeyError?: string;
};

export async function resolveLlmKey(tenantId: string, provider: LlmProvider): Promise<ResolvedLlmKey> {
  const [row] = await db
    .select({ encryptedKey: tenantLlmKeys.encryptedKey })
    .from(tenantLlmKeys)
    .where(
      and(
        eq(tenantLlmKeys.tenantId, tenantId),
        eq(tenantLlmKeys.provider, provider),
        eq(tenantLlmKeys.status, "active"),
      ),
    )
    .limit(1);

  if (!row) {
    // No tenant key set → platform key (unchanged behavior).
    return { key: null, source: "platform" };
  }

  try {
    const key = decryptSecret(row.encryptedKey);
    return { key, source: "tenant" };
  } catch {
    // LOUD FLAG (locked): fall back to platform, but never silently. Names tenant+provider ONLY —
    // never the key, the plaintext, or the blob.
    console.error(`[llm-keys] tenant ${tenantId} ${provider} key failed to decrypt — falling back to platform key`);
    return { key: null, source: "platform", tenantKeyError: "decrypt_failed" };
  }
}

export async function setTenantLlmKey(input: {
  tenantId: string;
  provider: LlmProvider;
  plaintextKey: string;
  label?: string | null;
  createdByUserId?: string | null;
}): Promise<{ id: string }> {
  // Throws if SECRET_ENCRYPTION_KEY is unset/invalid — surfaced to the caller (never a weak key).
  const encryptedKey = encryptSecret(input.plaintextKey);
  const id = uuidv7();

  // Single-active per (tenant, provider), enforced in-code (mirrors activateAgentPolicy's demote):
  // revoke any prior active row, then insert the new active one — atomically.
  await db.transaction(async (tx) => {
    await tx
      .update(tenantLlmKeys)
      .set({ status: "revoked" })
      .where(
        and(
          eq(tenantLlmKeys.tenantId, input.tenantId),
          eq(tenantLlmKeys.provider, input.provider),
          eq(tenantLlmKeys.status, "active"),
        ),
      );
    await tx.insert(tenantLlmKeys).values({
      id,
      tenantId: input.tenantId,
      provider: input.provider,
      encryptedKey,
      keyRef: KEY_REF,
      status: "active",
      label: input.label ?? null,
      createdByUserId: input.createdByUserId ?? null,
    });
  });

  return { id };
}

/** Demote the active key for (tenant, provider) without inserting a replacement. */
export async function revokeTenantLlmKey(tenantId: string, provider: LlmProvider): Promise<void> {
  await db
    .update(tenantLlmKeys)
    .set({ status: "revoked" })
    .where(
      and(
        eq(tenantLlmKeys.tenantId, tenantId),
        eq(tenantLlmKeys.provider, provider),
        eq(tenantLlmKeys.status, "active"),
      ),
    );
}
