import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { roles, tenants, tenantUsers, userRoles } from "@/server/schema";

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
  return true;
}
