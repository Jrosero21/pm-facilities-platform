"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createVendorContact } from "@/server/vendor-contacts";
import type { ContactActionState } from "@/components/contact-form";

function parseContact(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    isPrimary: formData.get("isPrimary") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createVendorContactAction(
  vendorId: string,
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const ctx = await requireTenant();
  const c = parseContact(formData);
  if (!c.name) return { error: "Name is required." };

  try {
    await createVendorContact({
      tenantId: ctx.activeTenant.tenantId,
      vendorId,
      ...c,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "VENDOR_NOT_FOUND") {
      return { error: "Vendor not found in this tenant." };
    }
    throw err;
  }

  revalidatePath(`/vendors/${vendorId}`);
  return null;
}
