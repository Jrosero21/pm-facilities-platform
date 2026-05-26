import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { vendorContacts } from "@/server/schema";
import { getVendor } from "@/server/vendors";

export type VendorContactRow = typeof vendorContacts.$inferSelect;

/** Non-archived contacts for a vendor, primary first then by name. */
export async function listVendorContacts(
  tenantId: string,
  vendorId: string,
): Promise<VendorContactRow[]> {
  return db
    .select()
    .from(vendorContacts)
    .where(
      and(
        eq(vendorContacts.tenantId, tenantId),
        eq(vendorContacts.vendorId, vendorId),
        ne(vendorContacts.status, "archived"),
      ),
    )
    .orderBy(desc(vendorContacts.isPrimary), vendorContacts.name);
}

/** One vendor contact by id, scoped to the tenant. Null if missing/cross-tenant. */
export async function getVendorContact(
  tenantId: string,
  id: string,
): Promise<VendorContactRow | null> {
  const rows = await db
    .select()
    .from(vendorContacts)
    .where(and(eq(vendorContacts.tenantId, tenantId), eq(vendorContacts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateVendorContactInput = {
  tenantId: string;
  vendorId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  createdByUserId: string;
};

/**
 * Create a vendor contact. Guards that the vendor exists within the tenant
 * first (parent-in-tenant), then inserts and writes a vendor_contact.created
 * audit row. Throws "VENDOR_NOT_FOUND" if the guard fails.
 */
export async function createVendorContact(
  input: CreateVendorContactInput,
): Promise<VendorContactRow> {
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const id = uuidv7();
  await db.insert(vendorContacts).values({
    id,
    tenantId: input.tenantId,
    vendorId: input.vendorId,
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
    action: "vendor_contact.created",
    targetType: "vendor_contact",
    targetId: id,
    metadata: { vendorId: input.vendorId, name: input.name },
  });

  const rows = await db
    .select()
    .from(vendorContacts)
    .where(and(eq(vendorContacts.tenantId, input.tenantId), eq(vendorContacts.id, id)))
    .limit(1);
  if (!rows[0]) throw new Error("Contact insert succeeded but row could not be reloaded.");
  return rows[0];
}
