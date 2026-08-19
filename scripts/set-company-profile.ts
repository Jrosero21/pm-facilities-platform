/**
 * scripts/set-company-profile.ts — set a tenant's COMPANY PROFILE (the invoice letterhead).
 *
 * WHY THIS EXISTS. invoice-pdf batch 1 added the profile columns and both accessors, but
 * deliberately no UI: the tenant-settings SURFACE is banked (CF-23.1 tenant LLM keys + CF-28.1
 * policy conditions build together), so a one-off company-profile screen would be exactly the
 * separate screen the bank says not to build. Until that surface lands, the profile is settable by
 * script — and this is that script.
 *
 * IT GOES THROUGH THE AUDITED SETTER. setTenantCompanyProfile() writes the row AND a
 * tenant.company_profile_updated audit row recording the changed FIELD NAMES (never the values — an
 * address is business data, not an audit payload). A raw UPDATE would set the same columns and
 * leave no trace; per the platform rule that every meaningful workflow gets a history row, it is
 * not an option here.
 *
 * PATCH SEMANTICS (inherited from the setter): a key PRESENT on the patch is written, an OMITTED
 * key is untouched, an explicit null CLEARS. So a second run with one field changes one field.
 *
 * ACTOR. The audit row needs a real user. This script QUERIES for one — a tenant_admin on the
 * target tenant, else a global super_admin (userRoles.tenantId IS NULL, the same shape
 * auth-context.ts:69 uses). Oldest grant wins so re-runs attribute to the same actor. If neither
 * exists it aborts; it will not invent an id, and it will not write an audit row pointing at a
 * user that does not exist.
 *
 * SAFETY (three gates, in order):
 *   1. TARGET. An empty connection string is the footgun — libpq falls back to a LOCAL database and
 *      the write silently lands in the wrong place. This refuses an empty/unset DATABASE_URL, and
 *      refuses a non-local target unless SET_COMPANY_PROFILE_PROD=1 is set (mirrors the
 *      APPLY_00NN_PROD=1 house convention).
 *   2. CONFIRM. Prints current_database() and the masked host BEFORE any write, and — on the prod
 *      path — requires that DB to be the expected one.
 *   3. DRY RUN BY DEFAULT. Writes nothing without --apply. Running this by accident is a no-op.
 *
 * Run (dry run first, always):
 *   pnpm set:company-profile                 # local, dry run
 *   pnpm set:company-profile -- --apply      # local, writes
 *   pnpm set:company-profile:prod            # NEON, dry run
 *   pnpm set:company-profile:prod -- --apply # NEON, writes
 *
 * ★ THE VALUES BELOW ARE PLACEHOLDERS. Replace them before running with --apply; the script
 *   refuses to write while any REPLACE_ME remains.
 */

export {};

// ═══ CONFIG — EDIT THIS BLOCK ═════════════════════════════════════════════════════════════
// Which tenant, by slug (stable and readable; the id is resolved below and printed, and the run
// aborts if no tenant matches). The slug DIFFERS between databases — prod Neon has
// "rose-analytics", local dev has "jonny-s-facilities-co" — so override it per target rather than
// trusting the default:  TENANT_SLUG=jonny-s-facilities-co pnpm set:company-profile
const TENANT_SLUG = process.env.TENANT_SLUG ?? "rose-analytics";

// The letterhead. Omit a key to leave it untouched; set null to clear it.
// ★ PLACEHOLDERS — every REPLACE_ME must be replaced (or the line deleted) before --apply.
const PROFILE_PATCH = {
  legalName: "REPLACE_ME — registered legal name, e.g. Rose Analytics LLC",
  addressLine1: "REPLACE_ME — street address",
  addressLine2: null as string | null, // suite / unit, or null
  city: "REPLACE_ME — city",
  stateProvince: "REPLACE_ME — state or province",
  postalCode: "REPLACE_ME — postal code",
  country: "US", // ISO-3166 alpha-2, max 2 chars (varchar(2))
  remitTo: "REPLACE_ME — remittance instructions printed in the REMIT TO block",
  phone: "REPLACE_ME — billing contact phone",
  email: "REPLACE_ME — billing contact email",
};
// ═══ END CONFIG ═══════════════════════════════════════════════════════════════════════════

const PLACEHOLDER = "REPLACE_ME";
const APPLY = process.argv.includes("--apply");
const PROD = process.env.SET_COMPANY_PROFILE_PROD === "1";
const TAG = "[set-company-profile]";

// ── GATE 1: TARGET — module top, before any @/server/db import (db.ts reads the URL on import) ──
const RAW = process.env.DATABASE_URL;
if (!RAW || RAW.trim() === "") {
  console.error(`${TAG} DATABASE_URL is empty or unset — refusing to run.`);
  console.error(`${TAG} An empty connection string does not fail; it falls back to a LOCAL database.`);
  process.exit(2);
}
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(RAW);
if (!isLocal && !PROD) {
  console.error(`${TAG} target is NOT local and SET_COMPANY_PROFILE_PROD=1 was not set — refusing.`);
  console.error(`${TAG} Use \`pnpm set:company-profile:prod\` if you mean to write to Neon.`);
  process.exit(2);
}
if (isLocal && PROD) {
  console.error(`${TAG} SET_COMPANY_PROFILE_PROD=1 but the URL resolved to localhost — aborting (prod intent, local URL).`);
  process.exit(2);
}
const EXPECTED_DB = PROD ? "neondb" : null; // local/sandbox DB name is not pinned; prod is
console.log(`${TAG} target: ${RAW.replace(/\/\/[^@]+@/, "//<creds>@").replace(/\?.*$/, "")}`);
console.log(`${TAG} mode:   ${APPLY ? "APPLY (will write)" : "DRY RUN (no write)"}${PROD ? "  ·  PROD opt-in set" : ""}`);

async function main(): Promise<void> {
  // Dynamic imports — after the target gate, so a bad URL never reaches the pool.
  const { and, asc, eq, isNull, or } = await import("drizzle-orm");
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/server/db");
  const { roles, tenants, userRoles, users } = await import("@/server/schema");
  const { setTenantCompanyProfile, getTenantCompanyProfile } = await import("@/server/tenant-settings");

  // ── GATE 2: CONFIRM the DB we are actually connected to, before anything else ──
  const dbRows = await db.execute<{ db: string }>(sql`SELECT current_database() AS db`);
  const dbName = dbRows.rows[0]?.db ?? "";
  console.log(`${TAG} connected database: ${dbName}`);
  if (EXPECTED_DB && dbName !== EXPECTED_DB) {
    console.error(`${TAG} ABORT: connected DB is "${dbName}", expected "${EXPECTED_DB}".`);
    process.exit(2);
  }

  // ── Resolve the tenant ──
  const tenantRows = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, TENANT_SLUG))
    .limit(1);
  const tenant = tenantRows[0];
  if (!tenant) {
    console.error(`${TAG} ABORT: no tenant with slug "${TENANT_SLUG}" in ${dbName}.`);
    process.exit(2);
  }
  console.log(`${TAG} tenant: ${tenant.name} (slug=${tenant.slug}, id=${tenant.id})`);

  // ── Resolve a REAL actor: tenant_admin on this tenant, else global super_admin ──
  const actorRows = await db
    .select({ userId: userRoles.userId, name: users.name, roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      or(
        and(eq(roles.key, "tenant_admin"), eq(userRoles.tenantId, tenant.id)),
        and(eq(roles.key, "super_admin"), isNull(userRoles.tenantId)),
      ),
    )
    .orderBy(asc(userRoles.grantedAt));
  const actor = actorRows.find((r) => r.roleKey === "tenant_admin") ?? actorRows[0];
  if (!actor) {
    console.error(`${TAG} ABORT: no tenant_admin on this tenant and no global super_admin in ${dbName}.`);
    console.error(`${TAG} The audit row needs a real user — this script will not fabricate one.`);
    process.exit(2);
  }
  console.log(`${TAG} actor:  ${actor.name} (${actor.roleKey}, id=${actor.userId})`);

  // ── Report the CURRENT profile, by field name + set/unset only (never dump business data) ──
  const before = await getTenantCompanyProfile(tenant.id);
  if (!before) {
    console.error(`${TAG} ABORT: getTenantCompanyProfile returned null (tenant row missing).`);
    process.exit(2);
  }
  const patchKeys = Object.keys(PROFILE_PATCH) as (keyof typeof PROFILE_PATCH)[];
  console.log(`${TAG} fields this patch touches (${patchKeys.length}):`);
  for (const k of patchKeys) {
    const wasSet = before[k] !== null && before[k] !== undefined;
    const willClear = PROFILE_PATCH[k] === null;
    console.log(`    ${k.padEnd(14)} currently ${wasSet ? "set" : "unset"} -> ${willClear ? "CLEARED" : "set"}`);
  }

  // ── GATE 3: placeholders + --apply ──
  const stillPlaceholder = patchKeys.filter(
    (k) => typeof PROFILE_PATCH[k] === "string" && (PROFILE_PATCH[k] as string).includes(PLACEHOLDER),
  );
  if (stillPlaceholder.length > 0) {
    console.log(`\n${TAG} ${stillPlaceholder.length} field(s) still hold ${PLACEHOLDER}: ${stillPlaceholder.join(", ")}`);
    console.log(`${TAG} Edit the CONFIG block at the top of this file, then re-run.`);
    if (APPLY) {
      console.error(`${TAG} ABORT: --apply refused while placeholders remain.`);
      process.exit(2);
    }
  }
  if (!APPLY) {
    console.log(`\n${TAG} DRY RUN — nothing written. Re-run with --apply to write.`);
    process.exit(0);
  }

  // ── WRITE (audited) ──
  await setTenantCompanyProfile({
    tenantId: tenant.id,
    patch: PROFILE_PATCH,
    actorUserId: actor.userId,
  });
  console.log(`\n${TAG} WROTE ${patchKeys.length} field(s) to ${dbName}: ${patchKeys.join(", ")}`);
  console.log(`${TAG} audit: tenant.company_profile_updated (actor ${actor.userId}, field NAMES only)`);

  // ── Read back: confirm each patched field is now in its intended set/cleared state ──
  const after = await getTenantCompanyProfile(tenant.id);
  const wrong = patchKeys.filter((k) => {
    const isSet = after?.[k] !== null && after?.[k] !== undefined;
    return PROFILE_PATCH[k] === null ? isSet : !isSet;
  });
  if (wrong.length > 0) {
    console.error(`${TAG} VERIFY FAILED — not in the intended state: ${wrong.join(", ")}`);
    process.exit(1);
  }
  console.log(`${TAG} verify: all ${patchKeys.length} field(s) read back in the intended state.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${TAG} ERROR:`, e);
  process.exit(1);
});
