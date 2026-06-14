/**
 * scripts/check-vendor-invoice-documents.ts — Phase (iii) Part 1 vendor-invoice DOCUMENT harness.
 *
 * Acceptance proof for the operator attach-document stack (MIME util + data layer):
 *   MIME UTIL (isSafeDocumentUpload / documentExt — pure, no DB):
 *     M1 application/pdf → safe, ext 'pdf'
 *     M2 .docx / .xlsx MIME → safe, ext docx/xlsx
 *     M3 image/jpeg + image/heic → safe, ext jpg/heic
 *     M4 application/x-msdownload (.exe) → BLOCKED
 *     M5 text/html → BLOCKED
 *     M6 benign MIME but .sh / .js filename → BLOCKED (extension defense)
 *     M7 application/octet-stream (unknown) → safe (permissive catch-all), ext 'bin'
 *   ATTACH (data layer, CaptureStorageProvider — no real R2):
 *     A1 tag='invoice' → job_attachments row: vendor_invoice_id set, attachment_type='invoice',
 *        visibility='internal_only', storage_key/checksum/size/mime + uploaded_by set (put ran)
 *     A2 tag mapping: signoff→signature, receipt→document, photo→photo, other→other
 *     A3 two docs on one invoice → listVendorInvoiceDocuments returns BOTH (many-docs-per-invoice)
 *     A4 a doc on invoice X does NOT appear in the list for invoice Y (scoping)
 *     A5 a mismatched tenant → attach throws VENDOR_INVOICE_NOT_FOUND (tenant guard)
 *     A6 (Part-3 prep) attachment_type='invoice' AND vendor_invoice_id=X finds the invoice doc, and is
 *        EMPTY for an invoice that only has a sign-off — the gate's lookup works
 *
 * STORAGE_CAPTURE=1 forces the in-memory CaptureStorageProvider (no real R2). SANDBOX ONLY —
 * hard-guarded (exit 2). Self-seeds tenant + client + job + vendor invoices, reuses the seed operator.
 * Self-teardown. Run: pnpm run db:check:vendor-invoice-documents
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-vendor-invoice-documents] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-vendor-invoice-documents] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.STORAGE_CAPTURE = "1"; // force the in-memory capture provider — no real R2 put
console.log(`[check-vendor-invoice-documents] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "vendor-invoice-documents-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, auditLogs, users, jobs, jobStatuses,
    vendors, vendorInvoices, vendorInvoiceLineItems, jobAttachments,
  } = await import("@/server/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { isSafeDocumentUpload, documentExt } = await import("@/lib/integrations/storage/document-mime");
  const { attachVendorInvoiceDocument, listVendorInvoiceDocuments } =
    await import("@/server/billing/vendor-invoice-documents");

  let tId = "";

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      await tx.delete(jobAttachments).where(eq(jobAttachments.tenantId, id));
      await tx.delete(vendorInvoiceLineItems).where(eq(vendorInvoiceLineItems.tenantId, id));
      await tx.delete(vendorInvoices).where(eq(vendorInvoices.tenantId, id));
      await tx.delete(vendors).where(eq(vendors.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
  }

  // pre-clean a leftover harness tenant (idempotency)
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }

  const leftover = async () =>
    (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG))).length;

  try {
    // ════════ MIME UTIL (pure — no DB, no seed) ════════
    console.log("\n[M] MIME UTIL — isSafeDocumentUpload / documentExt (permissive, blocks unsafe)");
    check("M1: application/pdf → safe, ext 'pdf'",
      isSafeDocumentUpload("application/pdf", "invoice.pdf") && documentExt("application/pdf", "invoice.pdf") === "pdf");
    check("M2: .docx / .xlsx MIME → safe, ext docx/xlsx",
      isSafeDocumentUpload("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx")
        && documentExt("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx") === "docx"
        && isSafeDocumentUpload("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "a.xlsx")
        && documentExt("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "a.xlsx") === "xlsx");
    check("M3: image/jpeg + image/heic → safe, ext jpg/heic",
      isSafeDocumentUpload("image/jpeg", "scan.jpg") && documentExt("image/jpeg", "scan.jpg") === "jpg"
        && isSafeDocumentUpload("image/heic", "scan.heic") && documentExt("image/heic", "scan.heic") === "heic");
    check("M4: application/x-msdownload (.exe) → BLOCKED",
      !isSafeDocumentUpload("application/x-msdownload", "tool.exe"));
    check("M5: text/html → BLOCKED",
      !isSafeDocumentUpload("text/html", "page.html"));
    check("M6: benign MIME but .sh / .js filename → BLOCKED (extension defense)",
      !isSafeDocumentUpload("application/pdf", "evil.sh") && !isSafeDocumentUpload("text/plain", "evil.js"));
    check("M7: application/octet-stream (unknown) → safe, ext 'bin'",
      isSafeDocumentUpload("application/octet-stream", "data") && documentExt("application/octet-stream", "data") === "bin");

    // ════════ SEED ════════
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [statusNew] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    check("setup: seed operator + NEW status exist", !!operator && !!statusNew);
    if (!operator || !statusNew) return finish();

    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Vendor-Invoice-Documents Harness Tenant" });
    const clientId = uuidv7();
    await db.insert(clients).values({ id: clientId, tenantId: tId, name: "Doc Harness Client" });
    const locId = uuidv7();
    await db.insert(clientLocations).values({
      id: locId, tenantId: tId, clientId, name: "Loc",
      addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101",
    });
    const jobId = uuidv7();
    await db.insert(jobs).values({
      id: jobId, tenantId: tId, jobNumber: 1, clientId, clientLocationId: locId,
      currentStatusId: statusNew.id, problemDescription: "Doc harness job",
    });
    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "Doc Harness Vendor" });

    const seedVendorInvoice = async (): Promise<string> => {
      const viId = uuidv7();
      await db.insert(vendorInvoices).values({ id: viId, tenantId: tId, jobId, vendorId, status: "received" });
      return viId;
    };
    const vi1 = await seedVendorInvoice(); // A1 / A3 / A6-positive
    const vi2 = await seedVendorInvoice(); // A2 mapping
    const vi3 = await seedVendorInvoice(); // A4 / A6-negative

    const attachDoc = async (vendorInvoiceId: string, tag: "invoice" | "signoff" | "receipt" | "photo" | "other", fileName: string, contentType: string) => {
      const { id } = await attachVendorInvoiceDocument({
        tenantId: tId, vendorInvoiceId, tag, bytes: Buffer.from("harness-doc-bytes"),
        contentType, fileName, uploadedByUserId: operator.id,
      });
      return (await db.select().from(jobAttachments).where(eq(jobAttachments.id, id)))[0];
    };

    // ════════ ATTACH (data layer) ════════
    console.log("\n[A] ATTACH — attachVendorInvoiceDocument + listVendorInvoiceDocuments (capture storage)");

    // A1 — invoice doc on vi1.
    const a1 = await attachDoc(vi1, "invoice", "vendor-invoice.pdf", "application/pdf");
    check("A1: invoice doc → row links vendor_invoice_id, type='invoice', internal_only, storage+mime+uploader set",
      a1?.vendorInvoiceId === vi1 && a1?.attachmentType === "invoice" && a1?.visibility === "internal_only"
        && a1?.storageKey != null && a1?.checksum != null && (a1?.fileSizeBytes ?? 0) > 0
        && a1?.fileMimeType === "application/pdf" && a1?.uploadedByUserId === operator.id && a1?.jobId === jobId,
      JSON.stringify({ vi: a1?.vendorInvoiceId === vi1, ty: a1?.attachmentType, vis: a1?.visibility, sk: a1?.storageKey != null, ck: a1?.checksum != null, sz: a1?.fileSizeBytes }));

    // A2 — tag → attachment_type mapping.
    const aSign = await attachDoc(vi2, "signoff", "signoff.pdf", "application/pdf");
    const aRcpt = await attachDoc(vi2, "receipt", "receipt.jpg", "image/jpeg");
    const aPhoto = await attachDoc(vi2, "photo", "site.jpg", "image/jpeg");
    const aOther = await attachDoc(vi2, "other", "misc.txt", "text/plain");
    check("A2: tag mapping — signoff→signature, receipt→document, photo→photo, other→other (invoice→invoice via A1)",
      aSign?.attachmentType === "signature" && aRcpt?.attachmentType === "document"
        && aPhoto?.attachmentType === "photo" && aOther?.attachmentType === "other",
      JSON.stringify({ signoff: aSign?.attachmentType, receipt: aRcpt?.attachmentType, photo: aPhoto?.attachmentType, other: aOther?.attachmentType }));

    // A3 — many docs per invoice: add a second doc to vi1, list returns both.
    await attachDoc(vi1, "signoff", "vi1-signoff.pdf", "application/pdf");
    const vi1Docs = await listVendorInvoiceDocuments(tId, vi1);
    check("A3: two docs on one invoice → list returns BOTH (many-docs-per-invoice)",
      vi1Docs.length === 2 && vi1Docs.every((d) => d.hasFile),
      `count=${vi1Docs.length}`);

    // A4 — scoping: a doc on vi2/vi3 does not appear in vi1's list (and vi1's not in vi3's).
    await attachDoc(vi3, "signoff", "vi3-signoff.pdf", "application/pdf");
    const vi3Docs = await listVendorInvoiceDocuments(tId, vi3);
    const vi1Ids = new Set(vi1Docs.map((d) => d.id));
    check("A4: list is per-invoice — vi3's docs are not in vi1's list and vice versa",
      vi3Docs.length === 1 && !vi1Ids.has(vi3Docs[0].id) && !vi3Docs.some((d) => vi1Ids.has(d.id)),
      `vi3 count=${vi3Docs.length}`);

    // A5 — tenant guard: a wrong tenant can't attach (getVendorInvoice is tenant-scoped → not found).
    let a5Threw = false;
    try {
      await attachVendorInvoiceDocument({
        tenantId: uuidv7(), vendorInvoiceId: vi1, tag: "invoice", bytes: Buffer.from("x"),
        contentType: "application/pdf", fileName: "x.pdf", uploadedByUserId: operator.id,
      });
    } catch (e) { a5Threw = (e as Error).message === "VENDOR_INVOICE_NOT_FOUND"; }
    check("A5: mismatched tenant → attach throws VENDOR_INVOICE_NOT_FOUND (tenant guard)", a5Threw);

    // A6 — the Part-3 gate lookup: invoice-tagged doc EXISTS for vi1, NONE for vi3 (signoff only).
    const invDocCount = async (viId: string): Promise<number> => {
      const rows = await db
        .select({ id: jobAttachments.id })
        .from(jobAttachments)
        .where(and(
          eq(jobAttachments.tenantId, tId),
          eq(jobAttachments.vendorInvoiceId, viId),
          eq(jobAttachments.attachmentType, "invoice"),
          eq(jobAttachments.status, "active"),
        ));
      return rows.length;
    };
    const vi1InvDocs = await invDocCount(vi1);
    const vi3InvDocs = await invDocCount(vi3);
    check("A6: gate lookup — invoice-tagged doc EXISTS for vi1 (1), NONE for vi3 sign-off-only (0)",
      vi1InvDocs === 1 && vi3InvDocs === 0,
      `vi1=${vi1InvDocs} vi3=${vi3InvDocs}`);

    console.log("\n[HONESTY]");
    console.log("  [check-vendor-invoice-documents] SEEDED-FIXTURE proof on the REAL MIME util + data layer.");
    console.log("  Capture storage provider (STORAGE_CAPTURE=1) — no real R2; put-before-insert still runs, so");
    console.log("  storage_key/checksum/size come from a real put. Proves permissive-but-blocks-unsafe typing,");
    console.log("  the tag→attachment_type mapping, the 0051 link (many docs → one vendor invoice), per-invoice");
    console.log("  scoping, the tenant guard, and the invoice-tagged lookup the Part-3 cost-plus gate will use.");

    await teardownTenant(tId);
    const n = await leftover();
    tId = "";
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-vendor-invoice-documents] teardown warning:", e); }
    }
    console.log("[check-vendor-invoice-documents] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-vendor-invoice-documents] passed: ${passed}`);
  console.log(`[check-vendor-invoice-documents] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-vendor-invoice-documents] VENDOR-INVOICE-DOCUMENTS LEDGER RED ✗");
  } else {
    console.log("[check-vendor-invoice-documents] VENDOR-INVOICE-DOCUMENTS LEDGER GREEN ✓ (permissive MIME / tag mapping / many-docs-per-invoice / per-invoice scoping / tenant guard / invoice-tagged gate lookup)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-vendor-invoice-documents] FAILED:", e); process.exit(1); });
