import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { clientLocations } from "@/server/schema";

export type ClientScopedLocationOption = {
  id: string;
  clientId: string;
  name: string;
};

/**
 * Lean {id, clientId, name} list of non-archived locations under the clients in
 * the viewer's scope, by name — ships to the /client/jobs/new form, which filters
 * client-side by the selected client (mirrors listClientLocationsForTenant's
 * shape, restricted to clientScope).
 *
 * client_locations use a `status` enum (active/inactive/archived) — non-archived
 * = ne(status, 'archived'), matching listClientLocationsForTenant exactly. Empty
 * scope → []. The clientId on each row lets the wrapper's location↔client gate
 * and the form's client-side filter both work off the same payload.
 *
 * Phase 11 batch 11f.
 */
export async function listClientScopedLocations(
  tenantId: string,
  clientScope: Set<string>,
): Promise<ClientScopedLocationOption[]> {
  if (clientScope.size === 0) return [];
  return db
    .select({
      id: clientLocations.id,
      clientId: clientLocations.clientId,
      name: clientLocations.name,
    })
    .from(clientLocations)
    .where(
      and(
        eq(clientLocations.tenantId, tenantId),
        inArray(clientLocations.clientId, [...clientScope]),
        ne(clientLocations.status, "archived"),
      ),
    )
    .orderBy(clientLocations.name);
}
