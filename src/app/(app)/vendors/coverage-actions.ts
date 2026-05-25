"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { createVendorTradeCoverage } from "@/server/vendor-trade-coverage";
import {
  createVendorServiceArea,
  type AreaType,
  type CreateVendorServiceAreaInput,
} from "@/server/vendor-service-areas";

export type CoverageActionState = { error: string } | null;

const AREA_TYPES = [
  "radius",
  "postal_code",
  "city",
  "county",
  "state",
  "national",
] as const;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062)
  );
}

export async function createTradeCoverageAction(
  vendorId: string,
  _prev: CoverageActionState,
  formData: FormData,
): Promise<CoverageActionState> {
  const ctx = await requireTenant();

  const tradeId = String(formData.get("tradeId") ?? "").trim();
  if (!tradeId) return { error: "Select a trade." };
  const vendorLocationId =
    String(formData.get("vendorLocationId") ?? "").trim() || null;
  const isPrimary = formData.get("isPrimary") === "on";

  try {
    await createVendorTradeCoverage({
      tenantId: ctx.activeTenant.tenantId,
      vendorId,
      tradeId,
      vendorLocationId,
      isPrimary,
      createdByUserId: ctx.user.id,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "VENDOR_NOT_FOUND":
          return { error: "Vendor not found in this tenant." };
        case "TRADE_NOT_FOUND":
          return { error: "That trade no longer exists." };
        case "LOCATION_NOT_FOUND":
          return { error: "That location is not valid for this vendor." };
        case "PRIMARY_EXISTS":
          return {
            error: "This vendor already has a primary trade; only one is allowed.",
          };
        case "DUPLICATE_COVERAGE":
          return { error: "This vendor already covers that trade for that scope." };
      }
    }
    if (isDuplicateKeyError(err)) {
      return { error: "This vendor already covers that trade for that location." };
    }
    throw err;
  }

  revalidatePath(`/vendors/${vendorId}/coverage`);
  return null;
}

export async function createServiceAreaAction(
  vendorId: string,
  _prev: CoverageActionState,
  formData: FormData,
): Promise<CoverageActionState> {
  const ctx = await requireTenant();

  const rawType = String(formData.get("areaType") ?? "").trim();
  if (!(AREA_TYPES as readonly string[]).includes(rawType)) {
    return { error: "Select a valid area type." };
  }
  const areaType = rawType as AreaType;
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const input: CreateVendorServiceAreaInput = {
    tenantId: ctx.activeTenant.tenantId,
    vendorId,
    vendorLocationId: get("vendorLocationId") || null,
    areaType,
    areaLabel: get("areaLabel") || null,
    createdByUserId: ctx.user.id,
  };

  // Discriminator-driven validation: each area_type requires its own value
  // columns and ignores the rest (Decision 2 — enforced here in the create path).
  switch (areaType) {
    case "radius": {
      const lat = get("centerLatitude");
      const lng = get("centerLongitude");
      const miles = get("radiusMiles");
      if (!lat || !lng || !miles) {
        return { error: "Radius areas need latitude, longitude, and radius (miles)." };
      }
      if ([lat, lng, miles].some((v) => Number.isNaN(Number(v)))) {
        return { error: "Latitude, longitude, and radius must be numbers." };
      }
      input.centerLatitude = lat;
      input.centerLongitude = lng;
      input.radiusMiles = miles;
      break;
    }
    case "postal_code": {
      const pc = get("postalCode");
      if (!pc) return { error: "Postal code is required." };
      input.postalCode = pc;
      break;
    }
    case "city": {
      const city = get("city");
      const st = get("stateCode");
      if (!city || !st) return { error: "City and state are required." };
      input.city = city;
      input.stateCode = st.toUpperCase();
      break;
    }
    case "county": {
      const county = get("countyName");
      const st = get("stateCode");
      if (!county || !st) return { error: "County and state are required." };
      input.countyName = county;
      input.stateCode = st.toUpperCase();
      break;
    }
    case "state": {
      const st = get("stateCode");
      if (!st) return { error: "State is required." };
      input.stateCode = st.toUpperCase();
      break;
    }
    case "national":
      break;
  }

  try {
    await createVendorServiceArea(input);
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "VENDOR_NOT_FOUND":
          return { error: "Vendor not found in this tenant." };
        case "LOCATION_NOT_FOUND":
          return { error: "That location is not valid for this vendor." };
      }
    }
    throw err;
  }

  revalidatePath(`/vendors/${vendorId}/coverage`);
  return null;
}
