"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createVendor, type VendorType } from "@/server/vendors";
import { createVendorLocation } from "@/server/vendor-locations";

export type CreateVendorState = { error: string } | null;

const VENDOR_TYPES = ["local", "regional", "national"] as const;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062)
  );
}

/**
 * Resolve vendor_type from form input. Missing/empty defaults to "local";
 * a present-but-unrecognized value is rejected (surfaced as an error) rather
 * than silently coerced, so bad input is visible.
 */
function parseVendorType(
  raw: FormDataEntryValue | null,
): VendorType | { error: string } {
  const v = String(raw ?? "").trim();
  if (v === "") return "local";
  if ((VENDOR_TYPES as readonly string[]).includes(v)) return v as VendorType;
  return { error: "Invalid vendor type." };
}

export async function createVendorAction(
  _prev: CreateVendorState,
  formData: FormData,
): Promise<CreateVendorState> {
  const ctx = await requireTenant();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const vendorType = parseVendorType(formData.get("vendorType"));
  if (typeof vendorType === "object") return vendorType;

  const trimOrNull = (key: string) =>
    String(formData.get(key) ?? "").trim() || null;

  // Optional inline HQ address. All-or-nothing, validated BEFORE creating the vendor so a partial
  // address fails fast (no orphan vendor). If provided → we create a "Headquarters" vendor_location
  // after the vendor via the EXISTING createVendorLocation writer.
  const hqLine1 = String(formData.get("addressLine1") ?? "").trim();
  const hqCity = String(formData.get("city") ?? "").trim();
  const hqState = String(formData.get("stateProvince") ?? "").trim();
  const hqPostal = String(formData.get("postalCode") ?? "").trim();
  const hqProvided = Boolean(hqLine1 || hqCity || hqState || hqPostal);
  if (hqProvided && !(hqLine1 && hqCity && hqState && hqPostal)) {
    return { error: "HQ address is incomplete — fill address line 1, city, state/province, and postal code, or leave them all blank." };
  }

  let newId: string;
  try {
    const created = await createVendor({
      tenantId: ctx.activeTenant.tenantId,
      name,
      legalName: trimOrNull("legalName"),
      vendorCode: trimOrNull("vendorCode"),
      vendorType,
      mainPhone: trimOrNull("mainPhone"),
      mainEmail: trimOrNull("mainEmail"),
      website: trimOrNull("website"),
      taxId: trimOrNull("taxId"),
      notes: trimOrNull("notes"),
      createdByUserId: ctx.user.id,
    });
    newId = created.id;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { error: "A vendor with that code already exists in this tenant." };
    }
    throw err;
  }

  // Inline HQ (optional) — reuse the existing createVendorLocation writer (audits vendor_location.created).
  if (hqProvided) {
    await createVendorLocation({
      tenantId: ctx.activeTenant.tenantId,
      vendorId: newId,
      name: "Headquarters",
      addressLine1: hqLine1,
      addressLine2: String(formData.get("addressLine2") ?? "").trim() || null,
      city: hqCity,
      stateProvince: hqState,
      postalCode: hqPostal,
      country: String(formData.get("country") ?? "").trim() || "US",
      createdByUserId: ctx.user.id,
    });
  }

  revalidatePath("/vendors");
  redirect(`/vendors/${newId}`);
}
