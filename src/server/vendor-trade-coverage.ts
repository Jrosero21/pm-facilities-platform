import "server-only";

import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { trades, vendorLocations, vendorTradeCoverage } from "@/server/schema";
import { getVendor } from "@/server/vendors";
import { getVendorLocation } from "@/server/vendor-locations";

export type VendorTradeCoverageListItem = {
  id: string;
  tradeId: string;
  tradeName: string;
  isPrimary: boolean;
  vendorLocationId: string | null;
  locationName: string | null;
  status: "active" | "inactive" | "archived";
};

/**
 * Non-archived trade coverage for a vendor, primary first then trade name.
 * Joined to trades (name) and vendor_locations (branch name for scoped rows).
 */
export async function listVendorTradeCoverage(
  tenantId: string,
  vendorId: string,
): Promise<VendorTradeCoverageListItem[]> {
  return db
    .select({
      id: vendorTradeCoverage.id,
      tradeId: vendorTradeCoverage.tradeId,
      tradeName: trades.name,
      isPrimary: vendorTradeCoverage.isPrimary,
      vendorLocationId: vendorTradeCoverage.vendorLocationId,
      locationName: vendorLocations.name,
      status: vendorTradeCoverage.status,
    })
    .from(vendorTradeCoverage)
    .innerJoin(trades, eq(vendorTradeCoverage.tradeId, trades.id))
    .leftJoin(
      vendorLocations,
      eq(vendorTradeCoverage.vendorLocationId, vendorLocations.id),
    )
    .where(
      and(
        eq(vendorTradeCoverage.tenantId, tenantId),
        eq(vendorTradeCoverage.vendorId, vendorId),
        ne(vendorTradeCoverage.status, "archived"),
      ),
    )
    .orderBy(desc(vendorTradeCoverage.isPrimary), trades.name);
}

export type CreateVendorTradeCoverageInput = {
  tenantId: string;
  vendorId: string;
  tradeId: string;
  vendorLocationId?: string | null;
  isPrimary?: boolean;
  createdByUserId: string;
};

/**
 * Add a trade to a vendor's coverage. Guards, in order:
 *  - vendor exists in tenant (VENDOR_NOT_FOUND)
 *  - trade exists in the global trades table (TRADE_NOT_FOUND)
 *  - if scoped, the location belongs to this vendor (LOCATION_NOT_FOUND)
 *  - single primary per vendor — reject if one already exists (PRIMARY_EXISTS)
 *  - org-wide (NULL location) duplicate guard (DUPLICATE_COVERAGE); branch-scoped
 *    duplicates are caught by the unique index and surface as ER_DUP_ENTRY.
 * Writes a vendor_trade_coverage.created audit row.
 */
export async function createVendorTradeCoverage(
  input: CreateVendorTradeCoverageInput,
): Promise<void> {
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const tradeRows = await db
    .select({ id: trades.id })
    .from(trades)
    .where(eq(trades.id, input.tradeId))
    .limit(1);
  if (!tradeRows[0]) throw new Error("TRADE_NOT_FOUND");

  const locationId = input.vendorLocationId ?? null;
  if (locationId) {
    const loc = await getVendorLocation(input.tenantId, locationId);
    if (!loc || loc.vendorId !== input.vendorId) throw new Error("LOCATION_NOT_FOUND");
  }

  if (input.isPrimary) {
    const existingPrimary = await db
      .select({ id: vendorTradeCoverage.id })
      .from(vendorTradeCoverage)
      .where(
        and(
          eq(vendorTradeCoverage.vendorId, input.vendorId),
          eq(vendorTradeCoverage.isPrimary, true),
          ne(vendorTradeCoverage.status, "archived"),
        ),
      )
      .limit(1);
    if (existingPrimary[0]) throw new Error("PRIMARY_EXISTS");
  }

  if (!locationId) {
    const existing = await db
      .select({ id: vendorTradeCoverage.id })
      .from(vendorTradeCoverage)
      .where(
        and(
          eq(vendorTradeCoverage.vendorId, input.vendorId),
          eq(vendorTradeCoverage.tradeId, input.tradeId),
          isNull(vendorTradeCoverage.vendorLocationId),
          ne(vendorTradeCoverage.status, "archived"),
        ),
      )
      .limit(1);
    if (existing[0]) throw new Error("DUPLICATE_COVERAGE");
  }

  const id = uuidv7();
  await db.insert(vendorTradeCoverage).values({
    id,
    tenantId: input.tenantId,
    vendorId: input.vendorId,
    tradeId: input.tradeId,
    vendorLocationId: locationId,
    isPrimary: input.isPrimary ?? false,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "vendor_trade_coverage.created",
    targetType: "vendor_trade_coverage",
    targetId: id,
    metadata: {
      vendorId: input.vendorId,
      tradeId: input.tradeId,
      vendorLocationId: locationId,
      isPrimary: input.isPrimary ?? false,
    },
  });
}
