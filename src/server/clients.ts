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
