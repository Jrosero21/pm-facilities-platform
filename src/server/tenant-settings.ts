import "server-only";

import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { tenants } from "@/server/schema";

// Per-tenant settings writes. A tenant-wide config change (unlike a per-record edit) is gated on
// tenant_admin — canManageTenantSettings is a PURE predicate (mirrors auth-context's accounting
// gate), so the authz RULE is unit-testable without a request/session; the server action calls it.

/** True when the actor may change tenant-wide settings (tenant_admin, or super_admin who always passes). */
export function canManageTenantSettings(roleKeys: string[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleKeys.includes("tenant_admin");
}

/** Read the tenant's client-priority weighting switch (false if the tenant row is missing). */
export async function getPriorityClientWeighting(tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ on: tenants.priorityClientWeightingEnabled })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0]?.on ?? false;
}

/** Set the switch + audit it (tenant.priority_weighting_toggled). Authz is enforced at the action. */
export async function setPriorityClientWeighting(input: {
  tenantId: string;
  enabled: boolean;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(tenants)
    .set({ priorityClientWeightingEnabled: input.enabled })
    .where(eq(tenants.id, input.tenantId));

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "tenant.priority_weighting_toggled",
    targetType: "tenant",
    targetId: input.tenantId,
    metadata: { enabled: input.enabled },
  });
}

// ── invoice-pdf batch 1 — TENANT COMPANY PROFILE (the invoice letterhead) ───────────────
// Read/write the aggregator's own identity for client-facing documents. NO UI this batch: the
// tenant-settings SURFACE is a standing deferral (CF-23.1 tenant LLM keys + CF-28.1 policy
// conditions are banked to build together), so a one-off company-profile screen would be exactly
// the separate screen that bank says not to build. The setter exists so the profile is settable
// by script today and the UI can adopt it unchanged.
// ★ NO LOGO field — deferred (D1): needs file-upload + R2 storage.

export type TenantCompanyProfile = {
  name: string; // tenants.name — always present; the renderer's fallback when everything else is null
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  remitTo: string | null;
  phone: string | null;
  email: string | null;
};

/** The company profile for document rendering. null ⇒ tenant row missing. */
export async function getTenantCompanyProfile(tenantId: string): Promise<TenantCompanyProfile | null> {
  const rows = await db
    .select({
      name: tenants.name,
      legalName: tenants.legalName,
      addressLine1: tenants.addressLine1,
      addressLine2: tenants.addressLine2,
      city: tenants.city,
      stateProvince: tenants.stateProvince,
      postalCode: tenants.postalCode,
      country: tenants.country,
      remitTo: tenants.remitTo,
      phone: tenants.phone,
      email: tenants.email,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/** Fields a company-profile patch may set. Omitted key ⇒ untouched; explicit null ⇒ cleared. */
export type TenantCompanyProfilePatch = Partial<Omit<TenantCompanyProfile, "name">>;

/**
 * PATCH the company profile + audit it (tenant.company_profile_updated). Authz is enforced at the
 * action layer via canManageTenantSettings (tenant-wide config), mirroring the weighting setter.
 * Only the keys PRESENT on the patch are written — an omitted key is untouched, an explicit null
 * clears. An empty patch is a no-op (no write, no audit), mirroring setClientBillingModel.
 * Audit metadata records the CHANGED FIELD NAMES only, never the values (an address is business
 * data, not an audit payload).
 */
export async function setTenantCompanyProfile(input: {
  tenantId: string;
  patch: TenantCompanyProfilePatch;
  actorUserId: string;
}): Promise<void> {
  const changedFields = Object.keys(input.patch) as (keyof TenantCompanyProfilePatch)[];
  if (changedFields.length === 0) return; // no-op — no write, no audit

  await db.update(tenants).set(input.patch).where(eq(tenants.id, input.tenantId));

  await writeAuditLog({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "tenant.company_profile_updated",
    targetType: "tenant",
    targetId: input.tenantId,
    metadata: { changedFields },
  });
}
