"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createVendor, type VendorType } from "@/server/vendors";

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

  revalidatePath("/vendors");
  redirect(`/vendors/${newId}`);
}
