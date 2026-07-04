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
