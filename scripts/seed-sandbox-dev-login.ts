/**
 * scripts/seed-sandbox-dev-login.ts — durable SANDBOX dev login (jnrosero@gmail.com).
 *
 * Creates a real, credentialed Better Auth login under the phase9-seed-tenant (the sandbox
 * tenant that holds the 5 priorities), so `pnpm dev` (now sandbox-default) can be logged into
 * as an operator to browser-verify CF-19.1a etc. Idempotent: safe to re-run.
 *
 * SANDBOX ONLY. The blessed creation path is auth.api.signUpEmail (NOT a raw insert — Better
 * Auth owns the scrypt password hash on the `accounts` credential row). Mirrors the Stage-3d
 * pattern in scripts/seed-sandbox-phase9.ts: signUpEmail (idempotent) → re-select by email →
 * tenant_users membership + user_roles grant.
 *
 * Password is supplied at run time (never hardcoded, never logged):
 *   DEV_USER_PASSWORD='<choose-one>' pnpm exec tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-dev-login.ts
 */

export {};

// ===== SANDBOX GUARD — module top, BEFORE any @/server/auth or @/server/db import =====
// (auth.ts statically imports db; a top-level import would bind the pool to PROD before this
//  swap runs and create the user in prod. db + auth are dynamic-imported inside main().)
const RAW = process.env.DATABASE_URL;
if (!RAW) {
  console.error("[dev-login] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const sandboxUrl = RAW.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[dev-login] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log(`[dev-login] sandbox target confirmed: ${sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@")}`);

// Password is a REQUIRED run-time param — never hardcoded, never logged.
const PW = process.env.DEV_USER_PASSWORD;
if (!PW) {
  console.error("[dev-login] set DEV_USER_PASSWORD=... to seed the dev login");
  process.exit(2);
}
// PW is narrowed to string here (post-guard); capture it so main()'s closure sees `string`.
const PASSWORD: string = PW;

const EMAIL = "jnrosero@gmail.com";
const NAME = "Jonny Rosero";
const TENANT_SLUG = "phase9-seed-tenant";
const ROLE_KEY = "operator";

async function main() {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const { auth } = await import("@/server/auth"); // dynamic — auth.ts statically imports db
  const { tenants, tenantUsers, userRoles, roles, users, accounts } = await import("@/server/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  // Ground-truth: the connected DB must be *_sandbox.
  const [dbRows] = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown as [{ db: string }[]];
  const dbName = dbRows[0]?.db ?? "";
  if (!/_sandbox$/.test(dbName)) {
    console.error(`[dev-login] ABORT: connected DB is "${dbName}", not a *_sandbox DB.`);
    process.exit(2);
  }
  console.log("[dev-login] connected DB confirmed:", dbName);

  // 1. Resolve the sandbox tenant by slug (don't hardcode the uuid).
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (!tenant) {
    console.error(`[dev-login] ${TENANT_SLUG} not found — run the phase9 sandbox seed first.`);
    process.exit(2);
  }
  const tenantId = tenant.id;

  // 2. Resolve the operator role by key.
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, ROLE_KEY)).limit(1);
  if (!role) {
    console.error(`[dev-login] role "${ROLE_KEY}" not found — run the phase9 sandbox seed first.`);
    process.exit(2);
  }
  const roleId = role.id;

  // 3. Create the login via the BLESSED path (Better Auth owns the credential hash).
  try {
    await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: NAME } });
    console.log("[dev-login] signUpEmail: user created");
  } catch (e) {
    // Idempotent: if the user already exists, continue; otherwise rethrow.
    const [pre] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (pre) {
      console.log("[dev-login] user exists, continuing");
    } else {
      console.error("[dev-login] signUpEmail failed (user not created):", (e as Error).message);
      throw e;
    }
  }

  // 4. Re-select the user by email (Better Auth assigns the id).
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!user) {
    console.error("[dev-login] user not found after signup — aborting.");
    process.exit(2);
  }
  const userId = user.id;

  // 5. Idempotent membership + role (existence-check then insert; guards the unique keys).
  const existingMembership = await db
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)))
    .limit(1);
  if (existingMembership.length === 0) {
    await db.insert(tenantUsers).values({ tenantId, userId, status: "active" });
    console.log("[dev-login] tenant_users: membership inserted (active)");
  } else {
    console.log("[dev-login] tenant_users: membership already present");
  }

  const existingRole = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId), eq(userRoles.tenantId, tenantId)))
    .limit(1);
  if (existingRole.length === 0) {
    await db.insert(userRoles).values({ userId, roleId, tenantId });
    console.log("[dev-login] user_roles: operator role granted");
  } else {
    console.log("[dev-login] user_roles: operator role already present");
  }

  // 6. VERIFY (no secrets — booleans only; the password is selected only to test non-null, never logged).
  const credRow = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  const credPresent = credRow.length > 0 && credRow[0].password != null;

  const membershipStatus = (
    await db.select({ status: tenantUsers.status }).from(tenantUsers).where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId))).limit(1)
  )[0]?.status;
  const roleOk = (
    await db.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId), eq(userRoles.tenantId, tenantId))).limit(1)
  ).length > 0;

  console.log("\n[dev-login] verify:");
  console.log(`  credential present: ${credPresent}`);
  console.log(`  tenant_users (phase9-seed-tenant): ${membershipStatus ?? "MISSING"}`);
  console.log(`  user_roles (operator): ${roleOk}`);

  if (credPresent && membershipStatus === "active" && roleOk) {
    console.log("\nDEV LOGIN READY: jnrosero@gmail.com on phase9-seed-tenant (sandbox)");
    process.exit(0);
  }
  console.error("\n[dev-login] INCOMPLETE — one of credential/membership/role is missing (see above).");
  process.exit(1);
}

main().catch((e) => { console.error("[dev-login] ERROR:", e); process.exit(1); });
