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
 * DESTRUCTIVE (10k-actions): checkAssignmentActionsSmoke calls acceptDispatch,
 * which permanently flips the seeded SENT assignment to ACCEPTED in the sandbox.
 * This harness is one-shot post-seed — re-running it without re-running the seed
 * first will fail the "exactly 1 SENT assignment seeded" assertion. (Full
 * per-transition coverage with seed-reset-between-tests is banked: FB-10k.4.)
 *
 * Run: npm run db:check:vendor-predicates  (after the seed; one shot)
 */

// -------- Sandbox guard + env swap --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-vendor-predicates] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(
  /\/pm(\?|$)/,
  "/pm_sandbox$1",
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

// -------- Impure + DESTRUCTIVE: acceptDispatch transition smoke (10k) --------
// Exercises acceptDispatch happy path + 2 refusals against the seeded SENT
// assignment. Permanently flips that assignment to ACCEPTED — see header note.
async function checkAssignmentActionsSmoke() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { acceptDispatch } = await import("@/server/vendor/assignment-actions");
  const { db } = await import("@/server/db");
  const {
    tenants,
    users,
    vendors,
    jobVendorAssignments,
    dispatchAssignmentStatuses,
    jobVendorAssignmentStatusHistory,
  } = await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, VF.SEED_VENDOR_USER.email));
  if (!tenant || !user) {
    check("actions: seed tenant + vendor user resolved", false);
    return;
  }
  const tenantId = tenant.id;

  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, VF.boundVendorName())));
  if (!vendor) {
    check("actions: bound vendor resolved", false);
    return;
  }
  const scope = new Set([vendor.id]);

  const [sentStatus] = await db
    .select({ id: dispatchAssignmentStatuses.id })
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.code, "SENT"));
  const [acceptedStatus] = await db
    .select({ id: dispatchAssignmentStatuses.id })
    .from(dispatchAssignmentStatuses)
    .where(eq(dispatchAssignmentStatuses.code, "ACCEPTED"));

  // Seeded mix, BEFORE we mutate it.
  const sentRows = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.vendorId, vendor.id),
        eq(jobVendorAssignments.currentStatusId, sentStatus.id),
      ),
    );
  const acceptedRows = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.vendorId, vendor.id),
        eq(jobVendorAssignments.currentStatusId, acceptedStatus.id),
      ),
    );
  check(
    "actions: bound vendor has EXPECTED_SENT_ASSIGNMENT_COUNT SENT assignment(s)",
    sentRows.length === VF.EXPECTED_SENT_ASSIGNMENT_COUNT,
  );
  check(
    "actions: bound vendor has EXPECTED_ACCEPTED_ASSIGNMENT_COUNT ACCEPTED assignment(s)",
    acceptedRows.length === VF.EXPECTED_ACCEPTED_ASSIGNMENT_COUNT,
  );
  if (sentRows.length === 0) return;
  const sentAssignmentId = sentRows[0].id;

  // -- happy path: SENT → ACCEPTED --
  await acceptDispatch({
    assignmentId: sentAssignmentId,
    tenantId,
    vendorScope: scope,
    actor: { kind: "user", userId: user.id },
  });
  const [afterRow] = await db
    .select({ statusId: jobVendorAssignments.currentStatusId })
    .from(jobVendorAssignments)
    .where(eq(jobVendorAssignments.id, sentAssignmentId));
  check(
    "acceptDispatch transitions SENT -> ACCEPTED",
    afterRow?.statusId === acceptedStatus.id,
  );

  const history = await db
    .select({
      from: jobVendorAssignmentStatusHistory.fromStatusId,
      to: jobVendorAssignmentStatusHistory.toStatusId,
    })
    .from(jobVendorAssignmentStatusHistory)
    .where(eq(jobVendorAssignmentStatusHistory.assignmentId, sentAssignmentId));
  check("acceptDispatch writes a history row", history.length >= 1);
  check(
    "acceptDispatch history row has SENT -> ACCEPTED status ids",
    history.some((h) => h.from === sentStatus.id && h.to === acceptedStatus.id),
  );

  // -- refusal: already ACCEPTED (status guard) --
  let notInStatus = false;
  try {
    await acceptDispatch({
      assignmentId: sentAssignmentId,
      tenantId,
      vendorScope: scope,
      actor: { kind: "user", userId: user.id },
    });
  } catch (err) {
    notInStatus =
      err instanceof Error && err.message === "ASSIGNMENT_NOT_IN_REQUIRED_STATUS";
  }
  check("acceptDispatch refuses a non-SENT assignment", notInStatus);

  // -- refusal: scope mismatch (checked before status, so fires regardless) --
  let scopeMismatch = false;
  try {
    await acceptDispatch({
      assignmentId: sentAssignmentId,
      tenantId,
      vendorScope: new Set(["bogus-vendor-id"]),
      actor: { kind: "user", userId: user.id },
    });
  } catch (err) {
    scopeMismatch =
      err instanceof Error && err.message === "VENDOR_SCOPE_MISMATCH";
  }
  check("acceptDispatch refuses a scope mismatch", scopeMismatch);
}

// -------- Impure: vendor notes visibility filter (10l, DoR-10l.2) --------
// Targets the bound vendor's EARLIEST assignment (same stable target the seed
// puts notes on). Status-agnostic — fine that checkAssignmentActionsSmoke has
// already flipped the SENT assignment.
async function checkVendorNotesVisibilityFilter() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { listVendorAssignmentNotes } = await import(
    "@/server/vendor/list-assignment-notes"
  );
  const { db } = await import("@/server/db");
  const { tenants, vendors, jobVendorAssignments } = await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  if (!tenant) {
    check("notes: seed tenant resolved", false);
    return;
  }
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenant.id), eq(vendors.name, VF.boundVendorName())));
  if (!vendor) {
    check("notes: bound vendor resolved", false);
    return;
  }
  const [asn] = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenant.id),
        eq(jobVendorAssignments.vendorId, vendor.id),
      ),
    )
    .orderBy(jobVendorAssignments.createdAt, jobVendorAssignments.id)
    .limit(1);
  if (!asn) {
    check("notes: bound vendor has an assignment", false);
    return;
  }

  const scope = new Set([vendor.id]);
  const notes = await listVendorAssignmentNotes(tenant.id, asn.id, scope);
  const expected = VF.expectedVendorVisibleNoteMarkers();
  const got = notes.map((n) => n.body).sort();
  const want = [...expected].sort();

  check(
    "notes filter: returns the expected visible-note count",
    notes.length === expected.length,
  );
  check(
    "notes filter: returns exactly the expected markers",
    JSON.stringify(got) === JSON.stringify(want),
  );
  check(
    "notes filter: excludes operator internal_only",
    !notes.some((n) => n.body.includes("operator internal-only")),
  );
  check(
    "notes filter: excludes operator client_visible-only",
    !notes.some((n) => n.body.includes("operator note for client only")),
  );
  check(
    "notes filter: includes operator vendor_visible",
    notes.some((n) => n.body.includes("operator note shared with vendor")),
  );
  check(
    "notes filter: includes vendor's own internal_only",
    notes.some((n) => n.body.includes("vendor's own internal note")),
  );
  check(
    "notes filter: empty scope returns []",
    (await listVendorAssignmentNotes(tenant.id, asn.id, new Set())).length === 0,
  );
}

// -------- Impure + DESTRUCTIVE: vendor photo placeholders (10m) --------
// Read-filter (author-scoped, DoR-10m.1) + write smoke (createVendorPhotoPlaceholder
// lands a real row — destructive, like the actions smoke). Targets the same
// earliest-CoolAir-assignment the seed attaches photos to.
async function checkVendorAttachmentsVisibilityFilter() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { listVendorAssignmentAttachments } = await import(
    "@/server/vendor/list-assignment-attachments"
  );
  const { createVendorPhotoPlaceholder } = await import(
    "@/server/vendor/create-vendor-photo-placeholder"
  );
  const { db } = await import("@/server/db");
  const { tenants, users, vendors, jobVendorAssignments, jobAttachments } =
    await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  const [vendorUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, VF.SEED_VENDOR_USER.email));
  if (!tenant || !vendorUser) {
    check("attachments: seed tenant + vendor user resolved", false);
    return;
  }
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenant.id), eq(vendors.name, VF.boundVendorName())));
  if (!vendor) {
    check("attachments: bound vendor resolved", false);
    return;
  }
  const [asn] = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenant.id),
        eq(jobVendorAssignments.vendorId, vendor.id),
      ),
    )
    .orderBy(jobVendorAssignments.createdAt, jobVendorAssignments.id)
    .limit(1);
  if (!asn) {
    check("attachments: bound vendor has an assignment", false);
    return;
  }
  const scope = new Set([vendor.id]);

  // -- read filter --
  const attachments = await listVendorAssignmentAttachments(tenant.id, asn.id, scope);
  const expected = VF.expectedVendorVisibleAttachmentMarkers();
  const got = attachments.map((a) => a.title).sort();
  const want = [...expected].sort();
  check(
    "attachments filter: returns expected count",
    attachments.length === expected.length,
  );
  check(
    "attachments filter: returns exactly the expected markers",
    JSON.stringify(got) === JSON.stringify(want),
  );
  check(
    "attachments filter: all returned rows have NULL file_url (placeholders)",
    attachments.every((a) => a.fileUrl === null),
  );
  check(
    "attachments filter: empty scope returns []",
    (await listVendorAssignmentAttachments(tenant.id, asn.id, new Set())).length === 0,
  );

  // -- write smoke (destructive: lands a real row) --
  const result = await createVendorPhotoPlaceholder({
    assignmentId: asn.id,
    tenantId: tenant.id,
    vendorScope: scope,
    actor: { kind: "user", userId: vendorUser.id },
    title: "[10m-harness] write smoke",
  });
  check(
    "createVendorPhotoPlaceholder returns an id",
    typeof result.id === "string" && result.id.length > 0,
  );
  const [written] = await db
    .select({
      fileUrl: jobAttachments.fileUrl,
      attachmentType: jobAttachments.attachmentType,
      visibility: jobAttachments.visibility,
    })
    .from(jobAttachments)
    .where(eq(jobAttachments.id, result.id));
  check("createVendorPhotoPlaceholder writes NULL file_url", written?.fileUrl === null);
  check(
    "createVendorPhotoPlaceholder writes attachment_type='photo'",
    written?.attachmentType === "photo",
  );
  check(
    "createVendorPhotoPlaceholder writes visibility='internal_only'",
    written?.visibility === "internal_only",
  );

  // -- refusal: scope mismatch --
  let scopeRefusal = false;
  try {
    await createVendorPhotoPlaceholder({
      assignmentId: asn.id,
      tenantId: tenant.id,
      vendorScope: new Set(["bogus-vendor-id"]),
      actor: { kind: "user", userId: vendorUser.id },
      title: "[10m-harness] should not land",
    });
  } catch (err) {
    scopeRefusal =
      err instanceof Error && err.message === "VENDOR_SCOPE_MISMATCH";
  }
  check("createVendorPhotoPlaceholder refuses scope mismatch", scopeRefusal);
}

// -------- Impure + DESTRUCTIVE: vendor invoice submission (10n) --------
// Read-back (seeded fixture invoice) + write smoke (submitVendorInvoice lands a
// real row via recordVendorInvoice — destructive) + empty/scope refusals.
async function checkVendorInvoiceSubmission() {
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { listVendorAssignmentInvoices } = await import(
    "@/server/vendor/list-assignment-invoices"
  );
  const { submitVendorInvoice } = await import(
    "@/server/vendor/submit-vendor-invoice"
  );
  const { db } = await import("@/server/db");
  const { tenants, users, vendors, jobVendorAssignments, vendorInvoices } =
    await import("@/server/schema");
  const { and, eq } = await import("drizzle-orm");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, VF.SEED_TENANT.slug));
  const [vendorUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, VF.SEED_VENDOR_USER.email));
  if (!tenant || !vendorUser) {
    check("invoices: seed tenant + vendor user resolved", false);
    return;
  }
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenant.id), eq(vendors.name, VF.boundVendorName())));
  if (!vendor) {
    check("invoices: bound vendor resolved", false);
    return;
  }
  const [asn] = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenant.id),
        eq(jobVendorAssignments.vendorId, vendor.id),
      ),
    )
    .orderBy(jobVendorAssignments.createdAt, jobVendorAssignments.id)
    .limit(1);
  if (!asn) {
    check("invoices: bound vendor has an assignment", false);
    return;
  }
  const scope = new Set([vendor.id]);

  // -- read-back: seeded fixture invoice --
  const invoices = await listVendorAssignmentInvoices(tenant.id, asn.id, scope);
  const fx = invoices.find(
    (inv) => inv.invoiceNumber === VF.VENDOR_INVOICE_FIXTURE.invoiceNumber,
  );
  check("invoices: fixture invoice present in read-back", !!fx);
  check(
    "invoices: fixture invoice source_type=vendor_portal",
    fx?.sourceType === "vendor_portal",
  );
  check("invoices: fixture invoice status=received", fx?.status === "received");
  check(
    "invoices: fixture invoice subtotal matches expected",
    String(fx?.subtotal) === VF.VENDOR_INVOICE_FIXTURE.expectedSubtotal,
  );
  check(
    "invoices: empty scope returns []",
    (await listVendorAssignmentInvoices(tenant.id, asn.id, new Set())).length === 0,
  );

  // -- write smoke (destructive) --
  const writeResult = await submitVendorInvoice({
    assignmentId: asn.id,
    tenantId: tenant.id,
    vendorScope: scope,
    actor: { kind: "user", userId: vendorUser.id },
    invoiceNumber: "[10n-harness] write smoke",
    lineItems: [
      { category: "labor", description: "harness labor", quantity: "1", unitPrice: "50.00" },
    ],
  });
  check(
    "submitVendorInvoice returns an id",
    typeof writeResult.id === "string" && writeResult.id.length > 0,
  );
  const [written] = await db
    .select({
      status: vendorInvoices.status,
      sourceType: vendorInvoices.sourceType,
      subtotal: vendorInvoices.subtotal,
    })
    .from(vendorInvoices)
    .where(eq(vendorInvoices.id, writeResult.id));
  check("submitVendorInvoice writes status=received", written?.status === "received");
  check(
    "submitVendorInvoice writes source_type=vendor_portal",
    written?.sourceType === "vendor_portal",
  );
  check(
    "submitVendorInvoice writes correct subtotal",
    String(written?.subtotal) === "50.00",
  );

  // -- refusal: empty line items (DoR-10n.3) --
  let emptyRefusal = false;
  try {
    await submitVendorInvoice({
      assignmentId: asn.id,
      tenantId: tenant.id,
      vendorScope: scope,
      actor: { kind: "user", userId: vendorUser.id },
      lineItems: [],
    });
  } catch (err) {
    emptyRefusal =
      err instanceof Error && err.message === "INVOICE_REQUIRES_LINE_ITEMS";
  }
  check("submitVendorInvoice refuses empty line items", emptyRefusal);

  // -- refusal: scope mismatch --
  let scopeRefusal = false;
  try {
    await submitVendorInvoice({
      assignmentId: asn.id,
      tenantId: tenant.id,
      vendorScope: new Set(["bogus-vendor"]),
      actor: { kind: "user", userId: vendorUser.id },
      lineItems: [{ category: "labor", description: "x", quantity: "1", unitPrice: "1" }],
    });
  } catch (err) {
    scopeRefusal =
      err instanceof Error && err.message === "VENDOR_SCOPE_MISMATCH";
  }
  check("submitVendorInvoice refuses scope mismatch", scopeRefusal);
}

// -------- Main --------
async function main() {
  checkIsVendorUser();
  checkCanActOnAssignment();
  checkCanSubmitVendorInvoice();
  await checkGetVendorScope();
  await checkGetVendorScopeWithFixture();
  await checkVendorAssignmentsListSmoke();
  await checkAssignmentActionsSmoke();
  await checkVendorNotesVisibilityFilter();
  await checkVendorAttachmentsVisibilityFilter();
  await checkVendorInvoiceSubmission();

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
