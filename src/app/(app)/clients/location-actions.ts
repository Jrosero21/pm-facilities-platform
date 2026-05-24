"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { createLocation } from "@/server/client-locations";

export type CreateLocationState = { error: string } | null;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062)
  );
}

export async function createLocationAction(
  clientId: string,
  _prev: CreateLocationState,
  formData: FormData,
): Promise<CreateLocationState> {
  const ctx = await requireTenant();

  const name = String(formData.get("name") ?? "").trim();
  const locationCode = String(formData.get("locationCode") ?? "").trim() || null;
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim();
  const stateProvince = String(formData.get("stateProvince") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || "US";

  if (!name) return { error: "Name is required." };
  if (!addressLine1 || !city || !stateProvince || !postalCode) {
    return {
      error: "Address line 1, city, state/province, and postal code are required.",
    };
  }

  try {
    await createLocation({
      tenantId: ctx.activeTenant.tenantId,
      clientId,
      name,
      locationCode,
      addressLine1,
      addressLine2,
      city,
      stateProvince,
      postalCode,
      country,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENT_NOT_FOUND") {
      return { error: "Client not found in this tenant." };
    }
    if (isDuplicateKeyError(err)) {
      return { error: "A location with that code already exists for this client." };
    }
    throw err;
  }

  revalidatePath(`/clients/${clientId}/locations`);
  redirect(`/clients/${clientId}/locations`);
}
