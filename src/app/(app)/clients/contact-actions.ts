"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createClientContact } from "@/server/client-contacts";
import { createLocationContact } from "@/server/location-contacts";
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

export async function createClientContactAction(
  clientId: string,
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const ctx = await requireTenant();
  const c = parseContact(formData);
  if (!c.name) return { error: "Name is required." };

  try {
    await createClientContact({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      ...c,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENT_NOT_FOUND") {
      return { error: "Client not found in this tenant." };
    }
    throw err;
  }

  revalidatePath(`/clients/${clientId}`);
  return null;
}

export async function createLocationContactAction(
  clientId: string,
  locationId: string,
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const ctx = await requireTenant();
  const c = parseContact(formData);
  if (!c.name) return { error: "Name is required." };

  try {
    await createLocationContact({
      tenantId: ctx.activeTenant.tenantId,
      locationId,
      ...c,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "LOCATION_NOT_FOUND") {
      return { error: "Location not found in this tenant." };
    }
    throw err;
  }

  revalidatePath(`/clients/${clientId}/locations/${locationId}`);
  return null;
}
