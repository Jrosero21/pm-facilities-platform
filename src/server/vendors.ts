import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { vendors } from "@/server/schema";

export type VendorRow = typeof vendors.$inferSelect;
export type VendorType = "local" | "regional" | "national";

/** All non-archived vendors for a tenant, ordered by name. Tenant-scoped. */
export async function listVendors(tenantId: string): Promise<VendorRow[]> {
  return db
    .select()
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), ne(vendors.status, "archived")))
    .orderBy(vendors.name);
}

/**
 * One vendor by id, scoped to the tenant. Returns null if it does not exist
 * or belongs to a different tenant (guards against cross-tenant id access).
 */
export async function getVendor(
  tenantId: string,
  id: string,
): Promise<VendorRow | null> {
  const rows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateVendorInput = {
  tenantId: string;
  name: string;
  legalName?: string | null;
  vendorCode?: string | null;
  vendorType?: VendorType;
  mainPhone?: string | null;
  mainEmail?: string | null;
  website?: string | null;
  taxId?: string | null;
  notes?: string | null;
  createdByUserId: string;
};

/**
 * Create a vendor and write a vendor.created audit row. The id is generated
 * here so it can be returned (MySQL has no RETURNING). Throws on duplicate
 * (tenant_id, vendor_code) — callers map that to a friendly error. Vendor name
 * is intentionally NOT unique per tenant (see schema/vendors.ts), so a
 * duplicate name never throws.
 */
export async function createVendor(
  input: CreateVendorInput,
): Promise<VendorRow> {
  const id = uuidv7();
  await db.insert(vendors).values({
    id,
    tenantId: input.tenantId,
    name: input.name,
    legalName: input.legalName ?? null,
    vendorCode: input.vendorCode ?? null,
    vendorType: input.vendorType ?? "local",
    mainPhone: input.mainPhone ?? null,
    mainEmail: input.mainEmail ?? null,
    website: input.website ?? null,
    taxId: input.taxId ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "vendor.created",
    targetType: "vendor",
    targetId: id,
    metadata: {
      name: input.name,
      vendorCode: input.vendorCode ?? null,
      vendorType: input.vendorType ?? "local",
    },
  });

  const row = await getVendor(input.tenantId, id);
  if (!row) throw new Error("Vendor insert succeeded but row could not be reloaded.");
  return row;
}
