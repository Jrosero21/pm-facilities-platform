import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import {
  auditLogs,
  locationBlockedVendors,
  locationPreferredVendors,
  trades,
  users,
  vendors,
} from "@/server/schema";
import { getLocation } from "@/server/client-locations";
import { getVendor } from "@/server/vendors";
import { getTrade } from "@/server/trades";

// Phase 22 (slice 3) — read/write for the two deterministic-routing tables.
// LOCATION-SCOPED authoring only: every row written here carries a concrete
// client_location_id. Client-wide bans (NULL client_location_id) are honored by
// the matcher but their authoring UI is deferred (CF-22.3). Soft-delete via
// status='archived' (archiveClientNteRule pattern) preserves the audit trail;
// list reads filter ne(status,'archived'). createdByUserId threads from the
// operator ctx; blocks also record `reason` on the row.

// ─── Preferred vendors ──────────────────────────────────────────────────────

export type LocationPreferredVendorListItem = {
  id: string;
  vendorId: string;
  vendorName: string;
  tradeId: string;
  tradeName: string;
  priority: number;
  notes: string | null;
  status: "active" | "inactive" | "archived";
};

/**
 * Non-archived preferred vendors for a location, strongest preference first
 * (priority ASC) then oldest-first. Joined to vendors + trades for display.
 * Location-scoped (this surface does not list client-wide rows).
 */
export async function listLocationPreferredVendors(
  tenantId: string,
  clientLocationId: string,
): Promise<LocationPreferredVendorListItem[]> {
  return db
    .select({
      id: locationPreferredVendors.id,
      vendorId: locationPreferredVendors.vendorId,
      vendorName: vendors.name,
      tradeId: locationPreferredVendors.tradeId,
      tradeName: trades.name,
      priority: locationPreferredVendors.priority,
      notes: locationPreferredVendors.notes,
      status: locationPreferredVendors.status,
    })
    .from(locationPreferredVendors)
    .innerJoin(vendors, eq(locationPreferredVendors.vendorId, vendors.id))
    .innerJoin(trades, eq(locationPreferredVendors.tradeId, trades.id))
    .where(
      and(
        eq(locationPreferredVendors.tenantId, tenantId),
        eq(locationPreferredVendors.clientLocationId, clientLocationId),
        ne(locationPreferredVendors.status, "archived"),
      ),
    )
    .orderBy(
      asc(locationPreferredVendors.priority),
      locationPreferredVendors.createdAt,
    );
}

export type CreateLocationPreferredVendorInput = {
  tenantId: string;
  clientLocationId: string;
  tradeId: string;
  vendorId: string;
  priority: number;
  notes?: string | null;
  createdByUserId: string;
};

/**
 * Mark a vendor preferred for a location + trade. Guards (unchanged, before the
 * tx): location belongs to the tenant (LOCATION_NOT_FOUND), vendor belongs to
 * the tenant (VENDOR_NOT_FOUND), trade exists (TRADE_NOT_FOUND).
 *
 * Then, inside a tx, row-lock the unique-key tuple (client_location_id, trade_id,
 * vendor_id) at ANY status and branch (22-3D — reactivate-on-readd):
 *   - no row        → INSERT a fresh active row (created audit).
 *   - archived row  → REACTIVATE in place, refreshing priority/notes/createdBy
 *                     (the operator re-adding owns the refreshed row; reactivated audit).
 *   - active/other  → throw DUPLICATE_PREFERRED_VENDOR.
 * The FOR UPDATE lock serializes concurrent re-adds (the 2nd waits, sees the now-
 * active row, throws DUPLICATE). The UNIQUE index is retained as the backstop for
 * the brand-new-triple race (surfaces as ER_DUP_ENTRY, caught in the action).
 */
export async function createLocationPreferredVendor(
  input: CreateLocationPreferredVendorInput,
): Promise<void> {
  const location = await getLocation(input.tenantId, input.clientLocationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");
  const trade = await getTrade(input.tradeId);
  if (!trade) throw new Error("TRADE_NOT_FOUND");

  await db.transaction(async (tx) => {
    // Row-lock the unique-key tuple at ANY status so concurrent re-adds serialize.
    const existing = (
      await tx
        .select({
          id: locationPreferredVendors.id,
          status: locationPreferredVendors.status,
        })
        .from(locationPreferredVendors)
        .where(
          and(
            eq(locationPreferredVendors.tenantId, input.tenantId),
            eq(locationPreferredVendors.clientLocationId, input.clientLocationId),
            eq(locationPreferredVendors.tradeId, input.tradeId),
            eq(locationPreferredVendors.vendorId, input.vendorId),
          ),
        )
        .for("update")
    )[0];

    // Active (or inactive) row already holds this triple → genuine duplicate.
    if (existing && existing.status !== "archived") {
      throw new Error("DUPLICATE_PREFERRED_VENDOR");
    }

    if (existing) {
      // Archived → reactivate in place, refreshing the operator-owned fields.
      await tx
        .update(locationPreferredVendors)
        .set({
          status: "active",
          priority: input.priority,
          notes: input.notes ?? null,
          createdByUserId: input.createdByUserId,
        })
        .where(
          and(
            eq(locationPreferredVendors.tenantId, input.tenantId),
            eq(locationPreferredVendors.id, existing.id),
          ),
        );
      await tx.insert(auditLogs).values({
        tenantId: input.tenantId,
        userId: input.createdByUserId,
        action: "location_preferred_vendor.reactivated",
        targetType: "location_preferred_vendor",
        targetId: existing.id,
        metadata: {
          clientLocationId: input.clientLocationId,
          tradeId: input.tradeId,
          vendorId: input.vendorId,
          priority: input.priority,
        },
      });
      return;
    }

    // No row → fresh insert. The UNIQUE index backstops a concurrent brand-new
    // insert of the same triple (ER_DUP_ENTRY, caught in the action).
    const id = uuidv7();
    await tx.insert(locationPreferredVendors).values({
      id,
      tenantId: input.tenantId,
      clientLocationId: input.clientLocationId,
      tradeId: input.tradeId,
      vendorId: input.vendorId,
      priority: input.priority,
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId,
    });
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.createdByUserId,
      action: "location_preferred_vendor.created",
      targetType: "location_preferred_vendor",
      targetId: id,
      metadata: {
        clientLocationId: input.clientLocationId,
        tradeId: input.tradeId,
        vendorId: input.vendorId,
        priority: input.priority,
      },
    });
  });
}

/**
 * Soft-delete a preferred-vendor row (active|inactive → archived). Tenant-scoped,
 * row-locked, idempotent (already-archived → no-op). In-tx audit row, atomic with
 * the status flip (archiveClientNteRule pattern).
 */
export async function archiveLocationPreferredVendor(input: {
  tenantId: string;
  id: string;
  actorUserId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = (
      await tx
        .select({
          status: locationPreferredVendors.status,
          clientLocationId: locationPreferredVendors.clientLocationId,
          tradeId: locationPreferredVendors.tradeId,
          vendorId: locationPreferredVendors.vendorId,
        })
        .from(locationPreferredVendors)
        .where(
          and(
            eq(locationPreferredVendors.tenantId, input.tenantId),
            eq(locationPreferredVendors.id, input.id),
          ),
        )
        .for("update")
    )[0];
    if (!row) throw new Error("PREFERRED_VENDOR_NOT_FOUND");
    if (row.status === "archived") return; // idempotent no-op

    await tx
      .update(locationPreferredVendors)
      .set({ status: "archived" })
      .where(
        and(
          eq(locationPreferredVendors.tenantId, input.tenantId),
          eq(locationPreferredVendors.id, input.id),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "location_preferred_vendor.archived",
      targetType: "location_preferred_vendor",
      targetId: input.id,
      metadata: {
        clientLocationId: row.clientLocationId,
        tradeId: row.tradeId,
        vendorId: row.vendorId,
      },
    });
  });
}

// ─── Blocked vendors (per-location authoring) ────────────────────────────────

export type LocationBlockedVendorListItem = {
  id: string;
  vendorId: string;
  vendorName: string;
  reason: string | null;
  blockedByName: string | null;
  blockedByEmail: string | null;
  createdAt: Date;
  status: "active" | "inactive" | "archived";
};

/**
 * Non-archived blocked vendors for THIS location (client_location_id = the
 * location — NOT the client-wide NULL rows, which this surface does not manage).
 * Joined to vendors (name) + the barring user (who/when display). Newest first.
 */
export async function listLocationBlockedVendors(
  tenantId: string,
  clientLocationId: string,
): Promise<LocationBlockedVendorListItem[]> {
  return db
    .select({
      id: locationBlockedVendors.id,
      vendorId: locationBlockedVendors.vendorId,
      vendorName: vendors.name,
      reason: locationBlockedVendors.reason,
      blockedByName: users.name,
      blockedByEmail: users.email,
      createdAt: locationBlockedVendors.createdAt,
      status: locationBlockedVendors.status,
    })
    .from(locationBlockedVendors)
    .innerJoin(vendors, eq(locationBlockedVendors.vendorId, vendors.id))
    .leftJoin(users, eq(locationBlockedVendors.createdByUserId, users.id))
    .where(
      and(
        eq(locationBlockedVendors.tenantId, tenantId),
        eq(locationBlockedVendors.clientLocationId, clientLocationId),
        ne(locationBlockedVendors.status, "archived"),
      ),
    )
    .orderBy(asc(locationBlockedVendors.createdAt));
}

export type CreateLocationBlockedVendorInput = {
  tenantId: string;
  clientId: string;
  clientLocationId: string;
  vendorId: string;
  reason?: string | null;
  createdByUserId: string;
};

/**
 * Bar a vendor from a location (company exclusion — no trade). Guards: location
 * belongs to the tenant (LOCATION_NOT_FOUND), the location's client matches the
 * passed clientId (CLIENT_MISMATCH), vendor belongs to the tenant
 * (VENDOR_NOT_FOUND); dedupe on an active (client, location, vendor) triple
 * (DUPLICATE_BLOCKED_VENDOR). Writes a location_blocked_vendor.created audit row;
 * who/when/reason are also recorded on the row itself.
 */
export async function createLocationBlockedVendor(
  input: CreateLocationBlockedVendorInput,
): Promise<void> {
  const location = await getLocation(input.tenantId, input.clientLocationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");
  if (location.clientId !== input.clientId) throw new Error("CLIENT_MISMATCH");
  const vendor = await getVendor(input.tenantId, input.vendorId);
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const existing = await db
    .select({ id: locationBlockedVendors.id })
    .from(locationBlockedVendors)
    .where(
      and(
        eq(locationBlockedVendors.clientId, input.clientId),
        eq(locationBlockedVendors.clientLocationId, input.clientLocationId),
        eq(locationBlockedVendors.vendorId, input.vendorId),
        ne(locationBlockedVendors.status, "archived"),
      ),
    )
    .limit(1);
  if (existing[0]) throw new Error("DUPLICATE_BLOCKED_VENDOR");

  const id = uuidv7();
  await db.insert(locationBlockedVendors).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientLocationId: input.clientLocationId,
    vendorId: input.vendorId,
    reason: input.reason ?? null,
    createdByUserId: input.createdByUserId,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.createdByUserId,
    action: "location_blocked_vendor.created",
    targetType: "location_blocked_vendor",
    targetId: id,
    metadata: {
      clientId: input.clientId,
      clientLocationId: input.clientLocationId,
      vendorId: input.vendorId,
      reason: input.reason ?? null,
    },
  });
}

/**
 * Soft-delete a blocked-vendor row (active|inactive → archived). Tenant-scoped,
 * row-locked, idempotent. In-tx audit, atomic with the status flip.
 */
export async function archiveLocationBlockedVendor(input: {
  tenantId: string;
  id: string;
  actorUserId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = (
      await tx
        .select({
          status: locationBlockedVendors.status,
          clientId: locationBlockedVendors.clientId,
          clientLocationId: locationBlockedVendors.clientLocationId,
          vendorId: locationBlockedVendors.vendorId,
        })
        .from(locationBlockedVendors)
        .where(
          and(
            eq(locationBlockedVendors.tenantId, input.tenantId),
            eq(locationBlockedVendors.id, input.id),
          ),
        )
        .for("update")
    )[0];
    if (!row) throw new Error("BLOCKED_VENDOR_NOT_FOUND");
    if (row.status === "archived") return; // idempotent no-op

    await tx
      .update(locationBlockedVendors)
      .set({ status: "archived" })
      .where(
        and(
          eq(locationBlockedVendors.tenantId, input.tenantId),
          eq(locationBlockedVendors.id, input.id),
        ),
      );

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "location_blocked_vendor.archived",
      targetType: "location_blocked_vendor",
      targetId: input.id,
      metadata: {
        clientId: row.clientId,
        clientLocationId: row.clientLocationId,
        vendorId: row.vendorId,
      },
    });
  });
}
