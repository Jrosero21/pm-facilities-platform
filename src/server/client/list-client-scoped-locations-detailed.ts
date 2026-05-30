import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { clientLocations, clients } from "@/server/schema";

export type ClientLocationDetailedRow = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};

/**
 * Client-facing locations reader — Phase 11 batch 11h (read-only).
 *
 * The client's OWN locations with their addresses (their own data), scope-filtered
 * and non-archived, grouped-ready (ordered by client name then location name).
 * Joins clients for the grouping label when a user is scoped to >1 client.
 *
 * Client-safe columns only: name + postal address. EXCLUDES lat/lng and any
 * operator-internal field. clients/client_locations use a `status` enum — non-
 * archived = ne(status, 'archived'), matching the 11f readers. Empty scope → [].
 */
export async function listClientLocationsDetailed(
  tenantId: string,
  clientScope: Set<string>,
): Promise<ClientLocationDetailedRow[]> {
  if (clientScope.size === 0) return [];
  return db
    .select({
      id: clientLocations.id,
      clientId: clientLocations.clientId,
      clientName: clients.name,
      name: clientLocations.name,
      addressLine1: clientLocations.addressLine1,
      addressLine2: clientLocations.addressLine2,
      city: clientLocations.city,
      stateProvince: clientLocations.stateProvince,
      postalCode: clientLocations.postalCode,
      country: clientLocations.country,
    })
    .from(clientLocations)
    .innerJoin(clients, eq(clientLocations.clientId, clients.id))
    .where(
      and(
        eq(clientLocations.tenantId, tenantId),
        inArray(clientLocations.clientId, [...clientScope]),
        ne(clientLocations.status, "archived"),
      ),
    )
    .orderBy(asc(clients.name), asc(clientLocations.name));
}
