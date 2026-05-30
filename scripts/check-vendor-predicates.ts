/**
 * scripts/check-vendor-predicates.ts
 *
 * Phase 10 (10g) — vendor predicate + resolver regression probe.
 *
 * Co-versioning contract (extended in 10j):
 *   src/server/role-predicates.ts (vendor predicates)
 *   src/server/vendor-scope.ts (getVendorScope)
 *   src/server/vendor/list-assigned-jobs.ts (listVendorAssignments)
 *   scripts/seed-sandbox-phase9-fixture.ts (vendor fixture block)
 *   scripts/check-vendor-predicates.ts (this harness)
 * all change together in a single commit. Adding/modifying a predicate or the
 * reader without updating its assertion here is a contract violation.
 *
 * SEED-DEPENDENT (10j, discharges FB-10g.2): the pure-predicate assertions need
 * no DB, but the fixture-derived assertions below require the Phase 9 sandbox
 * seed (scripts/seed-sandbox-phase9.ts) to have run — it creates SEED_VENDOR_USER
 * + the vendor_users mapping. Running this harness against a fresh sandbox that
 * has NOT been seeded fails the "SEED_VENDOR_USER exists in DB" assertion. This
 * matches check-analytics-readers.ts's existing seed precondition. The fixture
 * holds no DB ids (tenant/vendor via uuidv7, user via better-auth) — tenant,
 * vendor, and user ids are resolved from the DB at run time (by slug/name/email).
 *
 * Run: npm run db:check:vendor-predicates  (after the seed)
 */

// -------- Sandbox guard + env swap --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-vendor-predicates] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(
  /\/jonnyrosero_pm(\?|$)/,
  "/jonnyrosero_pm_sandbox$1",
);
if (sandboxUrl === originalUrl && !originalUrl.includes("_sandbox")) {
  console.error(
    "[check-vendor-predicates] could not derive sandbox URL from DATABASE_URL — refusing to run against non-sandbox DB",
  );
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;

// -------- Pure imports (no DB) --------
import {
  isVendorUser,
  canActOnAssignment,
  canSubmitVendorInvoice,
} from "@/server/role-predicates";

// -------- Tiny assertion framework --------
let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1;
  } else {
    failed.push(label);
  }
}

// -------- Pure: isVendorUser --------
function checkIsVendorUser() {
  check(
    "isVendorUser(vendor_user) === true",
    isVendorUser({ roleKeys: ["vendor_user"], isSuperAdmin: false }) === true,
  );
  check(
    "isVendorUser(operator) === false",
    isVendorUser({ roleKeys: ["operator"], isSuperAdmin: false }) === false,
  );
  check(
    "isVendorUser(empty roles) === false",
    isVendorUser({ roleKeys: [], isSuperAdmin: false }) === false,
  );
  check(
    "isVendorUser(super_admin) === true",
    isVendorUser({ roleKeys: [], isSuperAdmin: true }) === true,
  );
  check(
    "isVendorUser(vendor_user + operator) === true",
    isVendorUser({
      roleKeys: ["vendor_user", "operator"],
      isSuperAdmin: false,
    }) === true,
  );
}

// -------- Pure: canActOnAssignment --------
function checkCanActOnAssignment() {
  const scope = new Set(["vendor-a", "vendor-b"]);
  check(
    "canActOnAssignment allows tenant+scope match",
    canActOnAssignment(scope, { tenantId: "t1", vendorId: "vendor-a" }, "t1") ===
      true,
  );
  check(
    "canActOnAssignment denies tenant mismatch",
    canActOnAssignment(scope, { tenantId: "t1", vendorId: "vendor-a" }, "t2") ===
      false,
  );
  check(
    "canActOnAssignment denies vendor not in scope",
    canActOnAssignment(scope, { tenantId: "t1", vendorId: "vendor-c" }, "t1") ===
      false,
  );
  check(
    "canActOnAssignment denies on empty scope",
    canActOnAssignment(
      new Set<string>(),
      { tenantId: "t1", vendorId: "vendor-a" },
      "t1",
    ) === false,
  );
  check(
    "canActOnAssignment denies tenant mismatch even with scope hit",
    canActOnAssignment(scope, { tenantId: "t1", vendorId: "vendor-b" }, "t9") ===
      false,
  );
}

// -------- Pure: canSubmitVendorInvoice (mirrors canActOnAssignment in MVP) --------
function checkCanSubmitVendorInvoice() {
  const scope = new Set(["vendor-a"]);
  check(
    "canSubmitVendorInvoice allows tenant+scope match",
    canSubmitVendorInvoice(
      scope,
      { tenantId: "t1", vendorId: "vendor-a" },
      "t1",
    ) === true,
  );
  check(
    "canSubmitVendorInvoice denies tenant mismatch",
    canSubmitVendorInvoice(
      scope,
      { tenantId: "t1", vendorId: "vendor-a" },
      "t2",
    ) === false,
  );
  check(
    "canSubmitVendorInvoice denies vendor not in scope",
    canSubmitVendorInvoice(
      scope,
      { tenantId: "t1", vendorId: "vendor-b" },
      "t1",
    ) === false,
  );
  check(
    "canSubmitVendorInvoice denies on empty scope",
    canSubmitVendorInvoice(
      new Set<string>(),
      { tenantId: "t1", vendorId: "vendor-a" },
      "t1",
    ) === false,
  );
}

// -------- Impure: getVendorScope (structural-only; vendor_users empty) --------
async function checkGetVendorScope() {
  const { getVendorScope } = await import("@/server/vendor-scope");

  const scope1 = await getVendorScope(
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
  );
  check("getVendorScope returns a Set", scope1 instanceof Set);
  check("getVendorScope returns empty Set for non-mapped user", scope1.size === 0);

  const scope2 = await getVendorScope(
    "nonexistent-user-id",
    "nonexistent-tenant-id",
  );
  check(
    "getVendorScope returns empty Set even for unknown identifiers",
    scope2.size === 0,
  );

  const scope3 = await getVendorScope("", "");
  check(
    "getVendorScope handles empty strings without throwing (returns empty Set)",
    scope3 instanceof Set && scope3.size === 0,
  );
}

// -------- Impure: getVendorScope against the seeded vendor user (10j) --------
// Fixture holds no DB ids; resolve tenant (by slug), vendor user (by email), and
// bound vendor (by name within the tenant) at run time, then assert the resolved
// scope matches the fixture's declared binding.
async function checkGetVendorScopeWithFixture() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { getVendorScope } = await import("@/server/vendor-scope");
  const { db } = await import("@/server/db");
  const { users, tenants, vendors } = await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  check("fixture: SEED_TENANT exists in DB (seed has run)", tenantRows.length === 1);
  if (tenantRows.length !== 1) return;
  const tenantId = tenantRows[0].id;

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, VF.SEED_VENDOR_USER.email));
  check("fixture: SEED_VENDOR_USER exists in DB (seed has run)", userRows.length === 1);
  if (userRows.length !== 1) return;
  const vendorUserId = userRows[0].id;

  const vendorRows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, VF.boundVendorName())));
  check("fixture: bound vendor exists in DB", vendorRows.length === 1);
  if (vendorRows.length !== 1) return;
  const boundVendorId = vendorRows[0].id;

  const scope = await getVendorScope(vendorUserId, tenantId);
  check(
    "fixture: getVendorScope returns expected size for seeded vendor user",
    scope.size === VF.EXPECTED_VENDOR_SCOPE_SIZE,
  );
  check(
    "fixture: getVendorScope contains the bound vendor id",
    scope.has(boundVendorId),
  );
}

// -------- Impure: listVendorAssignments smoke against the seed (10j) --------
async function checkVendorAssignmentsListSmoke() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { listVendorAssignments } = await import(
    "@/server/vendor/list-assigned-jobs"
  );
  const { db } = await import("@/server/db");
  const { tenants, vendors } = await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  if (tenantRows.length !== 1) {
    check("fixture: list-smoke tenant resolved", false);
    return;
  }
  const tenantId = tenantRows[0].id;

  const vendorRows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, VF.boundVendorName())));
  if (vendorRows.length !== 1) {
    check("fixture: list-smoke vendor resolved", false);
    return;
  }
  const scope = new Set([vendorRows[0].id]);

  const rows = await listVendorAssignments(tenantId, scope);
  check(
    "fixture: listVendorAssignments returns EXPECTED_VENDOR_LIST_COUNT rows",
    rows.length === VF.EXPECTED_VENDOR_LIST_COUNT,
  );
  check(
    "fixture: listVendorAssignments excludes DRAFT (DoR-10j.1)",
    rows.every((r) => r.dispatchStatusCode !== "DRAFT"),
  );
  check(
    "fixture: every returned row's vendorId is in scope",
    rows.every((r) => scope.has(r.vendorId)),
  );
  check(
    "fixture: listVendorAssignments with empty scope returns []",
    (await listVendorAssignments(tenantId, new Set())).length === 0,
  );
}

// -------- Main --------
async function main() {
  checkIsVendorUser();
  checkCanActOnAssignment();
  checkCanSubmitVendorInvoice();
  await checkGetVendorScope();
  await checkGetVendorScopeWithFixture();
  await checkVendorAssignmentsListSmoke();

  console.log("");
  console.log(`[check-vendor-predicates] passed: ${passed}`);
  console.log(`[check-vendor-predicates] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("");
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("[check-vendor-predicates] OK");
  process.exit(0);
}

void main();
