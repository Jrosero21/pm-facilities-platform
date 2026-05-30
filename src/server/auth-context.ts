import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/server/audit";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { roles, tenants, tenantUsers, userRoles } from "@/server/schema";
import { isAccountingRole } from "@/server/billing/role-gates";
import { isVendorUser, isClientUser } from "@/server/role-predicates";
import { getVendorScope } from "@/server/vendor-scope";
import { getClientScope } from "@/server/client-scope";

export const ACTIVE_TENANT_COOKIE = "pm_active_tenant";

export type TenantType = "aggregator" | "vendor" | "client";

export type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: TenantType;
  membershipStatus: "active" | "invited" | "suspended";
};

export type AuthContext = {
  user: { id: string; email: string; name: string };
  sessionId: string;
  memberships: TenantMembership[];
  activeTenant: TenantMembership | null;
  /** Role keys effective right now: global roles plus roles in the active tenant. */
  roleKeys: string[];
  isSuperAdmin: boolean;
};

export type TenantAuthContext = AuthContext & { activeTenant: TenantMembership };

/**
 * Resolve the full auth context for the current request, or null if there is
 * no valid session. This is the single source of truth for "who is acting,
 * in which tenant, with which roles" and is the basis for every guard below.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const userId = session.user.id;

  const memberships: TenantMembership[] = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantType: tenants.type,
      membershipStatus: tenantUsers.status,
    })
    .from(tenantUsers)
    .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
    .where(eq(tenantUsers.userId, userId));

  const roleRows = await db
    .select({ key: roles.key, tenantId: userRoles.tenantId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const isSuperAdmin = roleRows.some(
    (r) => r.key === "super_admin" && r.tenantId === null,
  );

  // Resolve active tenant: a valid cookie choice wins, otherwise the sole/first
  // active membership. Cookie pointing at a tenant the user no longer belongs
  // to is ignored.
  const cookieStore = await cookies();
  const cookieTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;

  let activeTenant: TenantMembership | null = null;
  if (cookieTenantId) {
    activeTenant = memberships.find((m) => m.tenantId === cookieTenantId) ?? null;
  }
  if (!activeTenant) {
    activeTenant = memberships.find((m) => m.membershipStatus === "active") ?? null;
  }

  const roleKeys = roleRows
    .filter(
      (r) =>
        r.tenantId === null ||
        (activeTenant !== null && r.tenantId === activeTenant.tenantId),
    )
    .map((r) => r.key);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    sessionId: session.session.id,
    memberships,
    activeTenant,
    roleKeys: Array.from(new Set(roleKeys)),
    isSuperAdmin,
  };
}

/** Require an authenticated user. Redirects to /login otherwise. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Require an authenticated user who is acting within a tenant. Redirects to
 * /login if unauthenticated, or to /no-tenant if the user has no usable
 * tenant membership (e.g. a global super_admin with no tenant rows).
 */
export async function requireTenant(): Promise<TenantAuthContext> {
  const ctx = await requireAuth();
  if (!ctx.activeTenant) redirect("/no-tenant");
  return ctx as TenantAuthContext;
}

/**
 * Require that the current user holds at least one of the given role keys in
 * the active tenant (or globally). super_admin always passes. Redirects to
 * /forbidden on failure.
 */
export async function requireRole(...allowed: string[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.isSuperAdmin) return ctx;
  const ok = ctx.roleKeys.some((key) => allowed.includes(key));
  if (!ok) redirect("/forbidden");
  return ctx;
}

/**
 * Billing accounting-gate (8c.11d). The shared enforcement for accounting-gated billing actions
 * (send / void client invoice, record payment, close billing). Takes the already-resolved auth
 * context (so it is decoupled from the cookie read in requireTenant) and redirects /forbidden when
 * the actor is neither `accounting` nor `super_admin` — the policy lives in the pure, unit-tested
 * predicate isAccountingRole (8c-D2). Narrowed input type: depends ONLY on roleKeys + isSuperAdmin.
 */
export function enforceAccountingGate(ctx: Pick<AuthContext, "roleKeys" | "isSuperAdmin">): void {
  if (!isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin)) redirect("/forbidden");
}

/**
 * Set the active tenant cookie. Validates that the user is actually a member
 * before switching. Returns true on success. Intended for a future tenant
 * switcher action.
 */
export async function setActiveTenant(tenantId: string): Promise<boolean> {
  const ctx = await requireAuth();
  const isMember = ctx.memberships.some((m) => m.tenantId === tenantId);
  if (!isMember) return false;
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  await writeAuditLog({
    tenantId,
    userId: ctx.user.id,
    action: "tenant.switched",
    targetType: "tenant",
    targetId: tenantId,
  });
  return true;
}

/**
 * Vendor portal guard. Composes requireTenant() + isVendorUser + getVendorScope.
 *
 * Redirects:
 *   - /no-tenant if no active tenant (inherited from requireTenant)
 *   - /vendor-no-access if user is not a vendor_user, or if their vendor
 *     scope is empty (no vendor_users mapping rows for this tenant)
 *
 * Returns VendorAuthContext: TenantAuthContext extended with a resolved
 * vendorScope set, so callers don't re-fetch the scope downstream.
 *
 * Bare-redirect convention matching requireAuth/requireTenant/requireRole.
 * No flash/cookie attached.
 *
 * Phase 10 batch 10i.
 */
export type VendorAuthContext = TenantAuthContext & {
  vendorScope: Set<string>;
};

export async function requireVendor(): Promise<VendorAuthContext> {
  const ctx = await requireTenant();
  if (!isVendorUser(ctx)) {
    redirect("/vendor-no-access");
  }
  const vendorScope = await getVendorScope(
    ctx.user.id,
    ctx.activeTenant.tenantId,
  );
  if (vendorScope.size === 0) {
    redirect("/vendor-no-access");
  }
  return { ...ctx, vendorScope };
}

/**
 * Client portal guard. The requireVendor twin (Phase 11 11c). Composes
 * requireTenant() + isClientUser + getClientScope.
 *
 * Redirects:
 *   - /no-tenant if no active tenant (inherited from requireTenant)
 *   - /client-no-access if the user is not a client_user, or if their client
 *     scope is empty (no client_users mapping rows for this tenant)
 *
 * Returns ClientAuthContext: TenantAuthContext + a resolved clientScope set, so
 * callers don't re-fetch the scope downstream. The /client-no-access page is a
 * 11d concern (the (client) route group); this guard only holds the path.
 *
 * Bare-redirect convention matching requireVendor. No flash/cookie attached.
 *
 * Phase 11 batch 11c.
 */
export type ClientAuthContext = TenantAuthContext & {
  clientScope: Set<string>;
};

export async function requireClient(): Promise<ClientAuthContext> {
  const ctx = await requireTenant();
  if (!isClientUser(ctx)) {
    redirect("/client-no-access");
  }
  const clientScope = await getClientScope(
    ctx.user.id,
    ctx.activeTenant.tenantId,
  );
  if (clientScope.size === 0) {
    redirect("/client-no-access");
  }
  return { ...ctx, clientScope };
}
