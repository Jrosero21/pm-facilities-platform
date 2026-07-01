// Seed a tenant + membership + role for the admin user so the app workspace opens (flips
// "No tenant assigned" → workspace). ADDITIVE only (no deletes). Targets pg `pm` (the app DB).
//
// What opens the workspace (per src/server/auth-context.ts): a tenant_users row (status 'active')
// linking the user to a tenant → activeTenant becomes non-null. Roles (user_roles→roles) drive
// permissions; we grant `tenant_admin` (the tenant-scoped app-admin).
//
// Run:  pnpm tsx --conditions=react-server scripts/seed-tenant-membership.ts
// Env:  ADMIN_EMAIL (default jnrosero@gmail.com), TENANT_NAME (default "Jonny's Facilities Co"), TENANT_SLUG.
import { config } from "dotenv";
config({ path: ".env.local" });

const email = process.env.ADMIN_EMAIL ?? "jnrosero@gmail.com";
const tenantName = process.env.TENANT_NAME ?? "Jonny's Facilities Co";
const tenantSlug =
  process.env.TENANT_SLUG ??
  tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

// The canonical role reference data (mirrors seed-sandbox-phase9). Insert-if-absent — reference data,
// not a fixture. We grant tenant_admin below.
const CANONICAL_ROLES = [
  { key: "super_admin", label: "Super Admin", scope: "global" as const },
  { key: "tenant_admin", label: "Tenant Admin", scope: "tenant" as const },
  { key: "operator", label: "Operator", scope: "tenant" as const },
  { key: "accounting", label: "Accounting", scope: "tenant" as const },
  { key: "vendor_user", label: "Vendor User", scope: "tenant" as const },
  { key: "client_user", label: "Client User", scope: "tenant" as const },
];
const GRANT_ROLE_KEY = "tenant_admin";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) { console.error("[seed-tm] DATABASE_URL not set (expected pg pm)."); process.exit(2); }
  if (url.startsWith("mysql")) { console.error("[seed-tm] DATABASE_URL is MySQL — refusing; targets pg `pm`."); process.exit(2); }
  if (url.includes("_sandbox")) { console.error("[seed-tm] DATABASE_URL targets *_sandbox — refusing; the owner belongs in pg `pm`."); process.exit(2); }
  console.log(`[seed-tm] target: ${url.split("@")[1]?.split("?")[0] ?? "?"}  email: ${email}  tenant: "${tenantName}" (${tenantSlug})`);

  const { db } = await import("@/server/db");
  const { tenants, tenantUsers, roles, userRoles, users } = await import("@/server/schema");
  const { eq, and } = await import("drizzle-orm");
  const { v7: uuidv7 } = await import("uuid");

  // 1. the user
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) { console.error(`[seed-tm] user ${email} not found — run seed-admin-user first.`); process.exit(2); }

  // 2. tenant (idempotent by slug)
  let [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  if (!tenant) {
    const id = uuidv7();
    await db.insert(tenants).values({ id, name: tenantName, slug: tenantSlug }); // type/status use defaults (aggregator/active)
    tenant = { id };
    console.log(`[seed-tm] tenant created: ${id}`);
  } else {
    console.log(`[seed-tm] tenant already exists: ${tenant.id}`);
  }

  // 3. canonical roles reference data (insert-if-absent)
  for (const r of CANONICAL_ROLES) {
    const ex = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, r.key)).limit(1);
    if (!ex.length) await db.insert(roles).values({ id: uuidv7(), key: r.key, label: r.label, scope: r.scope });
  }
  const [grantRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, GRANT_ROLE_KEY)).limit(1);

  // 4. membership (idempotent by unique tenant_id+user_id) — THIS is what opens the workspace
  const memEx = await db.select({ id: tenantUsers.id }).from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenant.id), eq(tenantUsers.userId, user.id))).limit(1);
  if (!memEx.length) {
    await db.insert(tenantUsers).values({ id: uuidv7(), tenantId: tenant.id, userId: user.id }); // status default 'active'
    console.log(`[seed-tm] membership created (status active) → workspace will open`);
  } else {
    console.log(`[seed-tm] membership already exists`);
  }

  // 5. role grant (idempotent by unique user_id+role_id+tenant_id)
  const urEx = await db.select({ id: userRoles.id }).from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, grantRole.id), eq(userRoles.tenantId, tenant.id))).limit(1);
  if (!urEx.length) {
    await db.insert(userRoles).values({ id: uuidv7(), userId: user.id, roleId: grantRole.id, tenantId: tenant.id });
    console.log(`[seed-tm] role granted: ${GRANT_ROLE_KEY} (tenant-scoped)`);
  } else {
    console.log(`[seed-tm] role ${GRANT_ROLE_KEY} already granted`);
  }

  console.log(`[seed-tm] DONE — user ${email} is ${GRANT_ROLE_KEY} of tenant ${tenant.id}. Reload the browser; the workspace should open.`);
  process.exit(0);
}
main();
