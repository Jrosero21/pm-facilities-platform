import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { clients } from "@/server/schema";

export type ClientInScopeOption = { id: string; name: string };

/**
 * Lean {id, name} list of the clients in the viewer's client scope (non-archived),
 * by name — for the /client/jobs/new multi-client picker label. Mirrors
 * listClients' tenant + status filter, restricted to clientScope.
 *
 * clients use a `status` enum (active/inactive/archived) — non-archived =
 * ne(status, 'archived'), matching listClients exactly. Empty scope → [].
 *
 * Phase 11 batch 11f.
 */
export async function listClientsInScope(
  tenantId: string,
  clientScope: Set<string>,
): Promise<ClientInScopeOption[]> {
  if (clientScope.size === 0) return [];
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        inArray(clients.id, [...clientScope]),
        ne(clients.status, "archived"),
      ),
    )
    .orderBy(clients.name);
}
