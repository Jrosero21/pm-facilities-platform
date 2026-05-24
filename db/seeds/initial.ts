// Phase 1 initial seed: base roles, first aggregator tenant, first super_admin user.
//
// Idempotent: safe to re-run. Will skip rows that already exist.
//
// Env vars (set in .env.local):
//   SEED_ADMIN_PASSWORD  (required, 8+ chars — used for the super_admin login)
//   SEED_ADMIN_EMAIL     (default: jnrosero@gmail.com)
//   SEED_ADMIN_NAME      (default: "Jonathan Rosero")
//   SEED_TENANT_NAME     (default: "Demo Aggregator")
//   SEED_TENANT_SLUG     (default: "demo")
//
// Run:
//   pnpm db:seed

import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  roles,
  tenants,
  tenantUsers,
  userRoles,
  users,
} from "@/server/schema";

const tenantName = process.env.SEED_TENANT_NAME ?? "Demo Aggregator";
const tenantSlug = process.env.SEED_TENANT_SLUG ?? "demo";
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "jnrosero@gmail.com";
const adminName = process.env.SEED_ADMIN_NAME ?? "Jonathan Rosero";
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!adminPassword) {
  console.error(
    "[seed] SEED_ADMIN_PASSWORD is not set. Add it to .env.local (8+ chars) and re-run.",
  );
  process.exit(1);
}

const baseRoles = [
  {
    key: "super_admin",
    label: "Super Admin",
    scope: "global" as const,
    description: "Platform-level administrator. Acts across all tenants.",
  },
  {
    key: "tenant_admin",
    label: "Tenant Admin",
    scope: "tenant" as const,
    description: "Administers a single tenant: members, roles, settings.",
  },
  {
    key: "operator",
    label: "Operator",
    scope: "tenant" as const,
    description: "Manages jobs, dispatch, and day-to-day operations.",
  },
  {
    key: "accounting",
    label: "Accounting",
    scope: "tenant" as const,
    description: "Handles invoices, billing, and financial reporting.",
  },
  {
    key: "vendor_user",
    label: "Vendor User",
    scope: "tenant" as const,
    description: "External vendor portal user (full enablement in Phase 10).",
  },
  {
    key: "client_user",
    label: "Client User",
    scope: "tenant" as const,
    description: "External client portal user (full enablement in Phase 11).",
  },
];

async function main() {
  console.log("[seed] starting");

  // 1. Roles
  let rolesInserted = 0;
  for (const role of baseRoles) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, role.key))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(roles).values(role);
      rolesInserted += 1;
    }
  }
  console.log(
    `[seed] roles: ${rolesInserted} inserted, ${baseRoles.length - rolesInserted} already present`,
  );

  // 2. Aggregator tenant
  let tenant = (
    await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1)
  )[0];
  if (!tenant) {
    await db.insert(tenants).values({
      name: tenantName,
      slug: tenantSlug,
      type: "aggregator",
      status: "active",
    });
    tenant = (
      await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1)
    )[0];
    console.log(`[seed] tenant: created "${tenant.name}" (${tenant.id})`);
  } else {
    console.log(`[seed] tenant: already exists "${tenant.name}" (${tenant.id})`);
  }

  // 3. super_admin user via better-auth (handles password hashing)
  let user = (
    await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
  )[0];
  if (!user) {
    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword!,
        name: adminName,
      },
    });
    user = (
      await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
    )[0];
    console.log(`[seed] user: created ${user.email} (${user.id})`);
  } else {
    console.log(`[seed] user: already exists ${user.email} (${user.id})`);
  }

  // 4. tenant_users membership
  const membership = await db
    .select()
    .from(tenantUsers)
    .where(eq(tenantUsers.userId, user.id))
    .limit(1);
  if (membership.length === 0) {
    await db.insert(tenantUsers).values({
      tenantId: tenant.id,
      userId: user.id,
      status: "active",
    });
    console.log(`[seed] tenant_users: linked user to "${tenant.name}"`);
  } else {
    console.log(`[seed] tenant_users: link already exists`);
  }

  // 5. user_roles: super_admin (global) + tenant_admin (in the seeded tenant)
  const [superAdminRow] = await db
    .select()
    .from(roles)
    .where(eq(roles.key, "super_admin"));
  const [tenantAdminRow] = await db
    .select()
    .from(roles)
    .where(eq(roles.key, "tenant_admin"));

  const existingAssignments = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  const hasGlobalSuperAdmin = existingAssignments.some(
    (a) => a.roleId === superAdminRow.id && a.tenantId === null,
  );
  if (!hasGlobalSuperAdmin) {
    await db.insert(userRoles).values({
      userId: user.id,
      roleId: superAdminRow.id,
      tenantId: null,
    });
    console.log(`[seed] user_roles: granted super_admin (global)`);
  } else {
    console.log(`[seed] user_roles: super_admin (global) already granted`);
  }

  const hasTenantAdmin = existingAssignments.some(
    (a) => a.roleId === tenantAdminRow.id && a.tenantId === tenant.id,
  );
  if (!hasTenantAdmin) {
    await db.insert(userRoles).values({
      userId: user.id,
      roleId: tenantAdminRow.id,
      tenantId: tenant.id,
    });
    console.log(`[seed] user_roles: granted tenant_admin in "${tenant.name}"`);
  } else {
    console.log(`[seed] user_roles: tenant_admin in "${tenant.name}" already granted`);
  }

  console.log("[seed] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
