import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { vendorLocations } from "@/server/schema";
import { getVendor } from "@/server/vendors";

export type VendorLocationRow = typeof vendorLocations.$inferSelect;

/** Non-archived locations for a vendor, tenant- and vendor-scoped, by name. */
export async function listVendorLocations(
  tenantId: string,
  vendorId: string,
): Promise<VendorLocationRow[]> {
  return db
    .select()
    .from(vendorLocations)
    .where(
      and(
        eq(vendorLocations.tenantId, tenantId),
        eq(vendorLocations.vendorId, vendorId),
        ne(vendorLocations.status, "archived"),
      ),
    )
    .orderBy(vendorLocations.name);
}

/** One vendor location by id, scoped to the tenant. Null if missing/cross-tenant. */
export async function getVendorLocation(
  tenantId: string,
  id: string,
): Promise<VendorLocationRow | null> {
  const rows = await db
    .select()
    .from(vendorLocations)
    .where(and(eq(vendorLocations.tenantId, tenantId), eq(vendorLocations.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateVendorLocationInput = {
  tenantId: string;
  vendorId: string;
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
 * Create a location under a vendor. Verifies the vendor exists within the
 * tenant first (parent-in-tenant), then inserts and writes a
 * vendor_location.created audit row. Throws "VENDOR_NOT_FOUND" if the guard
 * fails; throws on duplicate (vendor_id, location_code).
 */
export async function createVendorLocation(
  input: CreateVendorLocationInput,
): Promise<VendorLocationRow> {
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const id = uuidv7();
  const country =
    input.country && input.country.trim() ? input.country.trim().toUpperCase() : "US";

  await db.insert(vendorLocations).values({
    id,
    tenantId: input.tenantId,
    vendorId: input.vendorId,
    name: input.name,
    locationCode: input.locationCode ?? null,
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
    action: "vendor_location.created",
    targetType: "vendor_location",
    targetId: id,
    metadata: {
      vendorId: input.vendorId,
      name: input.name,
      locationCode: input.locationCode ?? null,
    },
  });

  const row = await getVendorLocation(input.tenantId, id);
  if (!row) throw new Error("Location insert succeeded but row could not be reloaded.");
  return row;
}
