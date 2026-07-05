import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { clients } from "@/server/schema";

export type ClientRow = typeof clients.$inferSelect;

/** All non-archived clients for a tenant, ordered by name. Tenant-scoped. */
export async function listClients(tenantId: string): Promise<ClientRow[]> {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), ne(clients.status, "archived")))
    .orderBy(clients.name);
}

/**
 * One client by id, scoped to the tenant. Returns null if it does not exist
 * or belongs to a different tenant (guards against cross-tenant id access).
 */
export async function getClient(tenantId: string, id: string): Promise<ClientRow | null> {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateClientInput = {
  tenantId: string;
  name: string;
  clientCode?: string | null;
  createdByUserId: string;
};

/**
 * Create a client and write a client.created audit row. The id is generated
 * here so it can be returned (MySQL has no RETURNING). Throws on duplicate
 * (tenant_id, name) or (tenant_id, client_code) — callers map that to a
 * friendly error.
 */
export async function createClient(input: CreateClientInput): Promise<ClientRow> {
  const id = uuidv7();
  // Entity codes are normalized to uppercase on insert (matching country and
  // trades.code). The utf8mb4_unicode_ci collation already makes uniqueness and
  // lookups case-insensitive; normalizing the stored value keeps it canonical.
  const clientCode = input.clientCode?.trim().toUpperCase() || null;
  await db.insert(clients).values({
    id,
    tenantId: input.tenantId,
    name: input.name,
    clientCode,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "client.created",
    targetType: "client",
    targetId: id,
    metadata: { name: input.name, clientCode },
  });

  const row = await getClient(input.tenantId, id);
  if (!row) throw new Error("Client insert succeeded but row could not be reloaded.");
  return row;
}

export type UpdateClientPatch = {
  name?: string;
  clientCode?: string | null;
  isPriority?: boolean;
  autonomyAllowed?: boolean;
  mustNotifyClient?: boolean;
};

/**
 * The first client-edit path (createClient was create-only). Tenant-scoped; only the fields present
 * in `patch` are written. AUDITABILITY: a change to is_priority — an operational change that affects
 * the exceptions ranking — writes a client.priority_flag_changed audit row (before→after). Throws
 * CLIENT_NOT_FOUND for a missing/cross-tenant id (mirrors getClient's cross-tenant guard).
 */
export async function updateClient(input: {
  tenantId: string;
  id: string;
  actorUserId: string;
  patch: UpdateClientPatch;
}): Promise<ClientRow> {
  const before = await getClient(input.tenantId, input.id);
  if (!before) throw new Error("CLIENT_NOT_FOUND");

  const set: Partial<typeof clients.$inferInsert> = {};
  if (input.patch.name !== undefined) set.name = input.patch.name;
  if (input.patch.clientCode !== undefined) set.clientCode = input.patch.clientCode?.trim().toUpperCase() || null;
  if (input.patch.isPriority !== undefined) set.isPriority = input.patch.isPriority;
  if (input.patch.autonomyAllowed !== undefined) set.autonomyAllowed = input.patch.autonomyAllowed;
  if (input.patch.mustNotifyClient !== undefined) set.mustNotifyClient = input.patch.mustNotifyClient;

  if (Object.keys(set).length > 0) {
    await db.update(clients).set(set).where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.id)));
  }

  // Audit the priority-flag change specifically (only when it actually changes).
  if (input.patch.isPriority !== undefined && input.patch.isPriority !== before.isPriority) {
    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "client.priority_flag_changed",
      targetType: "client",
      targetId: input.id,
      metadata: { from: before.isPriority, to: input.patch.isPriority },
    });
  }

  // Phase 28 — audit the autonomy-consent change (change-only, mirrors priority_flag_changed). A
  // per-client autonomy gate change is a governance-relevant operational change.
  if (input.patch.autonomyAllowed !== undefined && input.patch.autonomyAllowed !== before.autonomyAllowed) {
    await writeAuditLog({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "client.autonomy_consent_changed",
      targetType: "client",
      targetId: input.id,
      metadata: { from: before.autonomyAllowed, to: input.patch.autonomyAllowed },
    });
  }

  const row = await getClient(input.tenantId, input.id);
  if (!row) throw new Error("Client update succeeded but row could not be reloaded.");
  return row;
}

/**
 * Phase 28 — the per-client autonomy-consent read for the autonomous gate. FAIL-SAFE toward gated
 * (§2.1): a null clientId (job with no client) or an unresolvable/cross-tenant client resolves to
 * { allowed: false } — autonomy is HELD unless a real, consented client row says otherwise. Never
 * throws. `allowed` is one more HOLD-only conjunct in the permitted chain; it can only make
 * `permitted` false, never widen. `mustNotify` is surfaced but not yet acted on (send deferred).
 */
export async function clientAutonomyConsent(
  tenantId: string,
  clientId: string | null,
): Promise<{ allowed: boolean; mustNotify: boolean }> {
  if (!clientId) return { allowed: false, mustNotify: false };
  const c = await getClient(tenantId, clientId);
  if (!c) return { allowed: false, mustNotify: false };
  return { allowed: c.autonomyAllowed, mustNotify: c.mustNotifyClient };
}
