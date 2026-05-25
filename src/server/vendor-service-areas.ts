import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { vendorLocations, vendorServiceAreas } from "@/server/schema";
import { getVendor } from "@/server/vendors";
import { getVendorLocation } from "@/server/vendor-locations";

export type AreaType =
  | "radius"
  | "postal_code"
  | "city"
  | "county"
  | "state"
  | "national";

export type VendorServiceAreaListItem = {
  id: string;
  areaType: AreaType;
  areaLabel: string | null;
  centerLatitude: string | null;
  centerLongitude: string | null;
  radiusMiles: string | null;
  postalCode: string | null;
  city: string | null;
  countyName: string | null;
  stateCode: string | null;
  countryCode: string;
  vendorLocationId: string | null;
  locationName: string | null;
  status: "active" | "inactive" | "archived";
};

/**
 * Non-archived service areas for a vendor, grouped by type then label. Joined to
 * vendor_locations for the branch name on scoped rows. decimal columns come back
 * as strings (mysql2), preserved as-is for display.
 */
export async function listVendorServiceAreas(
  tenantId: string,
  vendorId: string,
): Promise<VendorServiceAreaListItem[]> {
  return db
    .select({
      id: vendorServiceAreas.id,
      areaType: vendorServiceAreas.areaType,
      areaLabel: vendorServiceAreas.areaLabel,
      centerLatitude: vendorServiceAreas.centerLatitude,
      centerLongitude: vendorServiceAreas.centerLongitude,
      radiusMiles: vendorServiceAreas.radiusMiles,
      postalCode: vendorServiceAreas.postalCode,
      city: vendorServiceAreas.city,
      countyName: vendorServiceAreas.countyName,
      stateCode: vendorServiceAreas.stateCode,
      countryCode: vendorServiceAreas.countryCode,
      vendorLocationId: vendorServiceAreas.vendorLocationId,
      locationName: vendorLocations.name,
      status: vendorServiceAreas.status,
    })
    .from(vendorServiceAreas)
    .leftJoin(
      vendorLocations,
      eq(vendorServiceAreas.vendorLocationId, vendorLocations.id),
    )
    .where(
      and(
        eq(vendorServiceAreas.tenantId, tenantId),
        eq(vendorServiceAreas.vendorId, vendorId),
        ne(vendorServiceAreas.status, "archived"),
      ),
    )
    .orderBy(vendorServiceAreas.areaType, vendorServiceAreas.areaLabel);
}

export type CreateVendorServiceAreaInput = {
  tenantId: string;
  vendorId: string;
  vendorLocationId?: string | null;
  areaType: AreaType;
  areaLabel?: string | null;
  centerLatitude?: string | null;
  centerLongitude?: string | null;
  radiusMiles?: string | null;
  postalCode?: string | null;
  city?: string | null;
  countyName?: string | null;
  stateCode?: string | null;
  countryCode?: string;
  createdByUserId: string;
};

/**
 * Create a service area. Guards that the vendor (and, if scoped, the location)
 * belong to the tenant; the discriminator-driven required-field validation lives
 * in the action (the create-path parser) per Decision 2. Writes a
 * vendor_service_area.created audit row.
 */
export async function createVendorServiceArea(
  input: CreateVendorServiceAreaInput,
): Promise<void> {
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const locationId = input.vendorLocationId ?? null;
  if (locationId) {
    const loc = await getVendorLocation(input.tenantId, locationId);
    if (!loc || loc.vendorId !== input.vendorId) throw new Error("LOCATION_NOT_FOUND");
  }

  const id = uuidv7();
  await db.insert(vendorServiceAreas).values({
    id,
    tenantId: input.tenantId,
    vendorId: input.vendorId,
    vendorLocationId: locationId,
    areaType: input.areaType,
    areaLabel: input.areaLabel ?? null,
    centerLatitude: input.centerLatitude ?? null,
    centerLongitude: input.centerLongitude ?? null,
    radiusMiles: input.radiusMiles ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    countyName: input.countyName ?? null,
    stateCode: input.stateCode ?? null,
    countryCode: input.countryCode ?? "US",
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "vendor_service_area.created",
    targetType: "vendor_service_area",
    targetId: id,
    metadata: {
      vendorId: input.vendorId,
      areaType: input.areaType,
      areaLabel: input.areaLabel ?? null,
      vendorLocationId: locationId,
    },
  });
}
