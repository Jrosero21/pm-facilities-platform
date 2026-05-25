import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { getClient } from "@/server/clients";
import { db } from "@/server/db";
import { clientLocations } from "@/server/schema";

export type ClientLocationRow = typeof clientLocations.$inferSelect;

/** Non-archived locations for a client, tenant- and client-scoped, by name. */
export async function listLocations(
  tenantId: string,
  clientId: string,
): Promise<ClientLocationRow[]> {
  return db
    .select()
    .from(clientLocations)
    .where(
      and(
        eq(clientLocations.tenantId, tenantId),
        eq(clientLocations.clientId, clientId),
        ne(clientLocations.status, "archived"),
      ),
    )
    .orderBy(clientLocations.name);
}

export type ClientLocationOption = { id: string; clientId: string; name: string };

/**
 * All non-archived locations for a tenant (lean: id, clientId, name), by name.
 * Tenant-wide (not client-scoped) — ships to the new-job form, which filters
 * client-side by the selected client (option d). Switch to async fetch at
 * hundreds-of-locations scale (10-known-limitations.md carry-forward).
 */
export async function listClientLocationsForTenant(
  tenantId: string,
): Promise<ClientLocationOption[]> {
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
        ne(clientLocations.status, "archived"),
      ),
    )
    .orderBy(clientLocations.name);
}

/** One location by id, scoped to the tenant. Null if missing/cross-tenant. */
export async function getLocation(
  tenantId: string,
  id: string,
): Promise<ClientLocationRow | null> {
  const rows = await db
    .select()
    .from(clientLocations)
    .where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateLocationInput = {
  tenantId: string;
  clientId: string;
  name: string;
  locationCode?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country?: string;
  createdByUserId: string;
};

/**
 * Create a location under a client. Verifies the client exists within the
 * tenant first (so a location can't be attached to a missing or cross-tenant
 * client), then inserts and writes a client_location.created audit row.
 * Throws "CLIENT_NOT_FOUND" if the guard fails; throws on duplicate
 * (client_id, location_code).
 */
export async function createLocation(
  input: CreateLocationInput,
): Promise<ClientLocationRow> {
  const client = await getClient(input.tenantId, input.clientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  const id = uuidv7();
  const country =
    input.country && input.country.trim() ? input.country.trim().toUpperCase() : "US";
  // Entity codes are normalized to uppercase on insert (see clients.createClient).
  const locationCode = input.locationCode?.trim().toUpperCase() || null;

  await db.insert(clientLocations).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    name: input.name,
    locationCode,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    city: input.city,
    stateProvince: input.stateProvince,
    postalCode: input.postalCode,
    country,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "client_location.created",
    targetType: "client_location",
    targetId: id,
    metadata: {
      clientId: input.clientId,
      name: input.name,
      locationCode,
    },
  });

  const row = await getLocation(input.tenantId, id);
  if (!row) throw new Error("Location insert succeeded but row could not be reloaded.");
  return row;
}
