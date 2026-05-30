/**
 * scripts/check-vendor-predicates.ts
 *
 * Phase 10 (10g) — vendor predicate + resolver regression probe.
 *
 * Co-versioning contract:
 *   src/server/role-predicates.ts (vendor predicates)
 *   src/server/vendor-scope.ts (getVendorScope)
 *   scripts/check-vendor-predicates.ts (this harness)
 * all change together in a single commit. Adding/modifying a predicate
 * without updating its assertion here is a contract violation.
 *
 * Scope note (FB-10g.2): vendor_users is currently empty (no seed yet).
 * Impure-resolver assertions are structural-only — they verify
 * "returns a Set with size 0 for any (userId, tenantId)". When a future
 * sub-batch extends the Phase 9 seed to populate vendor_users rows, this
 * harness should be extended with fixture-derived
 * "given user X in tenant Y, expect vendor set {a,b}" assertions.
 *
 * Run: npm run db:check:vendor-predicates
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

// -------- Main --------
async function main() {
  checkIsVendorUser();
  checkCanActOnAssignment();
  checkCanSubmitVendorInvoice();
  await checkGetVendorScope();

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
