import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { getLocation } from "@/server/client-locations";
import { db } from "@/server/db";
import { clientLocationContacts } from "@/server/schema";

export type LocationContactRow = typeof clientLocationContacts.$inferSelect;

/** Non-archived contacts for a location, primary first then by name. */
export async function listLocationContacts(
  tenantId: string,
  locationId: string,
): Promise<LocationContactRow[]> {
  return db
    .select()
    .from(clientLocationContacts)
    .where(
      and(
        eq(clientLocationContacts.tenantId, tenantId),
        eq(clientLocationContacts.clientLocationId, locationId),
        ne(clientLocationContacts.status, "archived"),
      ),
    )
    .orderBy(desc(clientLocationContacts.isPrimary), clientLocationContacts.name);
}

export type CreateLocationContactInput = {
  tenantId: string;
  locationId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  createdByUserId: string;
};

/** Create a location contact (guards that the location is in the tenant). */
export async function createLocationContact(
  input: CreateLocationContactInput,
): Promise<LocationContactRow> {
  const location = await getLocation(input.tenantId, input.locationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");

  const id = uuidv7();
  await db.insert(clientLocationContacts).values({
    id,
    tenantId: input.tenantId,
    clientLocationId: input.locationId,
    name: input.name,
    title: input.title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "client_location_contact.created",
    targetType: "client_location_contact",
    targetId: id,
    metadata: { locationId: input.locationId, name: input.name },
  });

  const rows = await db
    .select()
    .from(clientLocationContacts)
    .where(
      and(
        eq(clientLocationContacts.tenantId, input.tenantId),
        eq(clientLocationContacts.id, id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Contact insert succeeded but row could not be reloaded.");
  return rows[0];
}
