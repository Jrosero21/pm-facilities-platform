"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import {
  archiveLocationBlockedVendor,
  archiveLocationPreferredVendor,
  createLocationBlockedVendor,
  createLocationPreferredVendor,
} from "@/server/dispatch-routing";

export type RoutingActionState = { error: string } | null;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062)
  );
}

function locationPath(clientId: string, locationId: string): string {
  return `/clients/${clientId}/locations/${locationId}`;
}

// ─── Preferred vendors ──────────────────────────────────────────────────────

export async function addPreferredVendorAction(
  clientId: string,
  locationId: string,
  _prev: RoutingActionState,
  formData: FormData,
): Promise<RoutingActionState> {
  const ctx = await requireTenant();

  const vendorId = String(formData.get("vendorId") ?? "").trim();
  if (!vendorId) return { error: "Select a vendor." };
  const tradeId = String(formData.get("tradeId") ?? "").trim();
  if (!tradeId) return { error: "Select a trade." };
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = Number(priorityRaw);
  if (!priorityRaw || !Number.isInteger(priority) || priority < 1) {
    return { error: "Priority must be a whole number (1 = highest)." };
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;

  try {
    await createLocationPreferredVendor({
      tenantId: ctx.activeTenant.tenantId,
      clientLocationId: locationId,
      tradeId,
      vendorId,
      priority,
      notes,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "LOCATION_NOT_FOUND":
          return { error: "Location not found in this tenant." };
        case "VENDOR_NOT_FOUND":
          return { error: "Vendor not found in this tenant." };
        case "TRADE_NOT_FOUND":
          return { error: "That trade no longer exists." };
        case "DUPLICATE_PREFERRED_VENDOR":
          return { error: "That vendor is already preferred for this trade here." };
      }
    }
    if (isDuplicateKeyError(err)) {
      return { error: "That vendor is already preferred for this trade here." };
    }
    throw err;
  }

  revalidatePath(locationPath(clientId, locationId));
  return null;
}

export async function removePreferredVendorAction(
  clientId: string,
  locationId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireTenant();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await archiveLocationPreferredVendor({
    tenantId: ctx.activeTenant.tenantId,
    id,
    actorUserId: ctx.user.id,
  });
  revalidatePath(locationPath(clientId, locationId));
}

// ─── Blocked vendors ─────────────────────────────────────────────────────────

export async function addBlockedVendorAction(
  clientId: string,
  locationId: string,
  _prev: RoutingActionState,
  formData: FormData,
): Promise<RoutingActionState> {
  const ctx = await requireTenant();

  const vendorId = String(formData.get("vendorId") ?? "").trim();
  if (!vendorId) return { error: "Select a vendor." };
  const reason = String(formData.get("reason") ?? "").trim() || null;

  try {
    await createLocationBlockedVendor({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      clientLocationId: locationId,
      vendorId,
      reason,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "LOCATION_NOT_FOUND":
          return { error: "Location not found in this tenant." };
        case "CLIENT_MISMATCH":
          return { error: "That location does not belong to this client." };
        case "VENDOR_NOT_FOUND":
          return { error: "Vendor not found in this tenant." };
        case "DUPLICATE_BLOCKED_VENDOR":
          return { error: "That vendor is already blocked at this location." };
      }
    }
    if (isDuplicateKeyError(err)) {
      return { error: "That vendor is already blocked at this location." };
    }
    throw err;
  }

  revalidatePath(locationPath(clientId, locationId));
  return null;
}

export async function removeBlockedVendorAction(
  clientId: string,
  locationId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requireTenant();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await archiveLocationBlockedVendor({
    tenantId: ctx.activeTenant.tenantId,
    id,
    actorUserId: ctx.user.id,
  });
  revalidatePath(locationPath(clientId, locationId));
}
