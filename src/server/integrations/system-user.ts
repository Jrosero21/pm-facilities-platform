import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";

// ── Phase 12 batch 12h-B.0 — SYSTEM / INTEGRATION USER (SF-1) ─────────────────────────
// System-originated ingest (webhook/poll) has no acting human, but createJob /
// createLocation require a non-null createdByUserId (FK→users). So a single GLOBAL
// service identity owns all system-originated records. It is a plain `users` row with
// NO account/password (it never authenticates) — created by scripts/seed-system-user.ts
// via a direct insert (deliberately NOT better-auth signUpEmail, which is for login users).
//
// createJob.createdByUserId is a plain FK→users (not tenant-scoped), so one global system
// user attributes records across all tenants without any tenant_users membership.

export const SYSTEM_USER_EMAIL = "integration@system.internal";
export const SYSTEM_USER_NAME = "Integration Service";

/**
 * Resolve the system/integration user's id. Throws SYSTEM_USER_NOT_SEEDED if the seed
 * (scripts/seed-system-user.ts) has not run in the target DB — the ingest wrapper relies
 * on this identity, so a missing system user must fail loudly, not silently null.
 */
export async function getSystemUserId(): Promise<string> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SYSTEM_USER_EMAIL))
    .limit(1);
  if (!rows[0]) {
    throw new Error(
      "SYSTEM_USER_NOT_SEEDED: run scripts/seed-system-user.ts (the integration service user is missing)",
    );
  }
  return rows[0].id;
}
