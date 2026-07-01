/**
 * scripts/check-cost-plus-doc-gate.ts — Phase (iii) Part 3 cost-plus doc-gate harness.
 *
 * Acceptance proof for the advisory gate predicate + the override metadata:
 *   shouldWarnMissingVendorDoc (cost_plus + toggle ON + source VI exists + no invoice doc):
 *     W1 cost_plus + toggle ON, source VI, NO invoice doc        → WARN (true)   [the core case]
 *     W2 same, but an invoice-tagged doc IS attached             → no warn (false)
 *     W3 same, but only a SIGN-OFF doc (attachment_type=signature) → WARN (true) [A6 distinction]
 *     W4 cost_plus + toggle OFF                                  → no warn (false)
 *     W5 rate_sheet + toggle ON                                  → no warn (false)
 *     W6 NO source vendor invoice (manual, no invoice_drafts)    → no warn (false)
 *     S3 rate_sheet client, JOB-level billing_model='cost_plus' override + toggle ON + no doc → WARN
 *        (the gate uses the EFFECTIVE model: job.billing_model ?? client.billing_model)
 *   SEND METADATA (sendClientInvoice → client_invoice.sent event):
 *     S1 send a warned invoice WITH acknowledgedMissingVendorDoc=true → metadata.issuedWithoutVendorDoc=true
 *     S2 send a non-warning invoice WITHOUT the flag → metadata has NO issuedWithoutVendorDoc key
 *
 * STORAGE_CAPTURE=1 forces the in-memory capture provider (the doc attaches reuse the Part-1 writer).
 * SANDBOX ONLY — hard-guarded (exit 2). Self-seeds tenant + 3 clients + jobs + vendor invoices + the
 * agent-draft linkage (invoice_drafts.published_client_invoice_id), reuses the seed operator.
 * Self-teardown. Run: pnpm run db:check:cost-plus-doc-gate
 */

export {};

// -------- Sandbox guard (BEFORE any DB import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-cost-plus-doc-gate] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[check-cost-plus-doc-gate] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.STORAGE_CAPTURE = "1"; // doc attaches use the in-memory capture provider — no real R2
console.log(`[check-cost-plus-doc-gate] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean, detail = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed.push(label); console.error(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
}

const TEST_TENANT_SLUG = "cost-plus-doc-gate-harness-tenant";

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, clientRates, auditLogs, users, jobs, jobStatuses,
    vendors, vendorInvoices, vendorInvoiceLineItems, jobAttachments, invoiceDrafts,
    clientInvoices, clientInvoiceLineItems, jobBillingEvents, agentRuns,
  } = await import("@/server/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { createClientInvoice, sendClientInvoice } = await import("@/server/billing/client-invoices");
  const { attachVendorInvoiceDocument } = await import("@/server/billing/vendor-invoice-documents");
  const { shouldWarnMissingVendorDoc } = await import("@/server/billing/cost-plus-doc-gate");

  let tId = "";

  async function teardownTenant(id: string) {
    await db.transaction(async (tx) => {
      await tx.delete(jobBillingEvents).where(eq(jobBillingEvents.tenantId, id));
      await tx.delete(clientInvoiceLineItems).where(eq(clientInvoiceLineItems.tenantId, id));
      await tx.delete(clientInvoices).where(eq(clientInvoices.tenantId, id));
      await tx.delete(invoiceDrafts).where(eq(invoiceDrafts.tenantId, id));
      await tx.delete(agentRuns).where(eq(agentRuns.tenantId, id));
      await tx.delete(jobAttachments).where(eq(jobAttachments.tenantId, id));
      await tx.delete(vendorInvoiceLineItems).where(eq(vendorInvoiceLineItems.tenantId, id));
      await tx.delete(vendorInvoices).where(eq(vendorInvoices.tenantId, id));
      await tx.delete(vendors).where(eq(vendors.tenantId, id));
      await tx.delete(jobs).where(eq(jobs.tenantId, id));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, id));
      await tx.delete(clientRates).where(eq(clientRates.tenantId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id));
      await tx.delete(clients).where(eq(clients.tenantId, id));
      await tx.delete(tenants).where(eq(tenants.id, id));
    });
  }

  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG)).limit(1);
    if (prior[0]) await teardownTenant(prior[0].id);
  }
  const leftover = async () =>
    (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, TEST_TENANT_SLUG))).length;

  try {
    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    const [statusNew] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    check("setup: seed operator + NEW status exist", !!operator && !!statusNew);
    if (!operator || !statusNew) return finish();

    // ════════ SEED ════════
    tId = uuidv7();
    await db.insert(tenants).values({ id: tId, slug: TEST_TENANT_SLUG, name: "Cost-Plus Doc-Gate Harness Tenant" });

    // A: cost_plus + toggle ON · B: cost_plus + toggle OFF · C: rate_sheet + toggle ON
    const clientA = uuidv7(), clientB = uuidv7(), clientC = uuidv7();
    await db.insert(clients).values([
      { id: clientA, tenantId: tId, name: "A cost_plus toggle-on", billingModel: "cost_plus", requireVendorInvoiceForCostPlus: true },
      { id: clientB, tenantId: tId, name: "B cost_plus toggle-off", billingModel: "cost_plus", requireVendorInvoiceForCostPlus: false },
      { id: clientC, tenantId: tId, name: "C rate_sheet toggle-on", billingModel: "rate_sheet", requireVendorInvoiceForCostPlus: true },
    ]);
    const loc = (clientId: string) => {
      const id = uuidv7();
      return { id, tenantId: tId, clientId, name: "Loc", addressLine1: "1 Test St", city: "Testville", stateProvince: "NV", postalCode: "89101" };
    };
    const locA = loc(clientA), locB = loc(clientB), locC = loc(clientC);
    await db.insert(clientLocations).values([locA, locB, locC]);

    let jobNum = 0;
    const mkJob = (clientId: string, locId: string, billingModel: "cost_plus" | "rate_sheet" | "flat" | null) => {
      const id = uuidv7();
      jobNum += 1;
      return { id, tenantId: tId, jobNumber: jobNum, clientId, clientLocationId: locId, currentStatusId: statusNew.id, problemDescription: "Gate harness job", billingModel };
    };
    const jobA = mkJob(clientA, locA.id, null);              // effective cost_plus (client default)
    const jobB = mkJob(clientB, locB.id, null);              // effective cost_plus
    const jobC = mkJob(clientC, locC.id, null);              // effective rate_sheet
    const jobC2 = mkJob(clientC, locC.id, "cost_plus");      // JOB override → effective cost_plus (S3)
    await db.insert(jobs).values([jobA, jobB, jobC, jobC2]);

    const vendorId = uuidv7();
    await db.insert(vendors).values({ id: vendorId, tenantId: tId, name: "Gate Harness Vendor" });

    const seedVendorInvoice = async (jobId: string): Promise<string> => {
      const id = uuidv7();
      await db.insert(vendorInvoices).values({ id, tenantId: tId, jobId, vendorId, status: "received" });
      return id;
    };
    // A client invoice linked (agent-draft) to a source vendor invoice via invoice_drafts.
    const seedLinkedClientInvoice = async (jobId: string, clientId: string, vendorInvoiceId: string): Promise<string> => {
      const { id } = await createClientInvoice({ tenantId: tId, jobId, clientId, createdByUserId: operator.id });
      const runId = uuidv7();
      await db.insert(agentRuns).values({ id: runId, tenantId: tId, agentId: "invoice_creator_v1", jobId, startedAt: new Date() });
      await db.insert(invoiceDrafts).values({
        id: uuidv7(), tenantId: tId, jobId, agentRunId: runId, vendorInvoiceId, clientId,
        proposedInvoice: { lineItems: [] }, status: "published", publishedClientInvoiceId: id,
      });
      return id;
    };
    const attachDoc = async (vendorInvoiceId: string, tag: "invoice" | "signoff") =>
      attachVendorInvoiceDocument({
        tenantId: tId, vendorInvoiceId, tag, bytes: Buffer.from("harness-doc"),
        contentType: "application/pdf", fileName: "doc.pdf", uploadedByUserId: operator.id,
      });

    // Source vendor invoices + linked client invoices.
    const viA1 = await seedVendorInvoice(jobA.id); const ciA1 = await seedLinkedClientInvoice(jobA.id, clientA, viA1); // W1 / S1
    const viA2 = await seedVendorInvoice(jobA.id); const ciA2 = await seedLinkedClientInvoice(jobA.id, clientA, viA2); // W2
    const viA3 = await seedVendorInvoice(jobA.id); const ciA3 = await seedLinkedClientInvoice(jobA.id, clientA, viA3); // W3
    const viB = await seedVendorInvoice(jobB.id);  const ciB = await seedLinkedClientInvoice(jobB.id, clientB, viB);  // W4 / S2
    const viC = await seedVendorInvoice(jobC.id);  const ciC = await seedLinkedClientInvoice(jobC.id, clientC, viC);  // W5
    const viC2 = await seedVendorInvoice(jobC2.id); const ciC2 = await seedLinkedClientInvoice(jobC2.id, clientC, viC2); // S3
    // Manual client invoice on jobA — NO invoice_drafts link (no source VI).
    const { id: ciManual } = await createClientInvoice({ tenantId: tId, jobId: jobA.id, clientId: clientA, createdByUserId: operator.id }); // W6

    await attachDoc(viA2, "invoice");   // W2: invoice doc on file
    await attachDoc(viA3, "signoff");   // W3: sign-off only (no invoice doc)

    // ════════ shouldWarnMissingVendorDoc ════════
    console.log("\n[W] shouldWarnMissingVendorDoc — cost_plus + toggle + source VI + no invoice doc");
    const warn = (ciId: string, jobId: string, clientId: string) => shouldWarnMissingVendorDoc(tId, { id: ciId, jobId, clientId });

    check("W1: cost_plus + toggle ON, source VI, NO doc → WARN", (await warn(ciA1, jobA.id, clientA)) === true);
    check("W2: invoice-tagged doc on file → no warn", (await warn(ciA2, jobA.id, clientA)) === false);
    check("W3: only a SIGN-OFF doc (signature, no invoice) → WARN (A6 distinction)", (await warn(ciA3, jobA.id, clientA)) === true);
    check("W4: cost_plus + toggle OFF → no warn (toggle gates it)", (await warn(ciB, jobB.id, clientB)) === false);
    check("W5: rate_sheet + toggle ON → no warn (not cost_plus)", (await warn(ciC, jobC.id, clientC)) === false);
    check("W6: no source vendor invoice (manual) → no warn", (await warn(ciManual, jobA.id, clientA)) === false);
    check("S3: rate_sheet client, JOB override billing_model=cost_plus + toggle + no doc → WARN (effective model)",
      (await warn(ciC2, jobC2.id, clientC)) === true);

    // ════════ SEND METADATA ════════
    console.log("\n[S] SEND METADATA — sendClientInvoice → client_invoice.sent event");
    const sentMeta = async (clientInvoiceId: string): Promise<Record<string, unknown> | null> => {
      const rows = await db
        .select({ metadata: jobBillingEvents.metadata })
        .from(jobBillingEvents)
        .where(and(
          eq(jobBillingEvents.tenantId, tId),
          eq(jobBillingEvents.clientInvoiceId, clientInvoiceId),
          eq(jobBillingEvents.eventType, "client_invoice.sent"),
        ))
        .limit(1);
      const raw = rows[0]?.metadata;
      if (raw == null) return null;
      return (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
    };

    // S1 — warned invoice issued WITH acknowledgment → override recorded.
    await sendClientInvoice({ tenantId: tId, id: ciA1, actorUserId: operator.id, acknowledgedMissingVendorDoc: true });
    const s1 = await sentMeta(ciA1);
    check("S1: send WITH acknowledgedMissingVendorDoc=true → event metadata.issuedWithoutVendorDoc === true",
      s1?.issuedWithoutVendorDoc === true, JSON.stringify(s1));

    // S2 — non-warning invoice issued WITHOUT the flag → no override key.
    await sendClientInvoice({ tenantId: tId, id: ciB, actorUserId: operator.id });
    const s2 = await sentMeta(ciB);
    check("S2: send WITHOUT the flag → event metadata has NO issuedWithoutVendorDoc key",
      s2 == null || !("issuedWithoutVendorDoc" in s2), JSON.stringify(s2));

    console.log("\n[HONESTY]");
    console.log("  [check-cost-plus-doc-gate] SEEDED-FIXTURE proof on the REAL gate predicate + send writer.");
    console.log("  Capture storage (STORAGE_CAPTURE=1) for the doc attaches; the invoice_drafts link is");
    console.log("  seeded directly. Proves the four-condition warn (cost_plus + toggle + source VI + no");
    console.log("  invoice doc), the A6 signoff-doesn't-satisfy distinction, the effective-model (job");
    console.log("  override) path, manual-invoice skip, and that the override is recorded in the sent");
    console.log("  event metadata ONLY when the warning applied + was acknowledged.");

    await teardownTenant(tId);
    const n = await leftover();
    tId = "";
    check("teardown: 0 leftover harness tenants", n === 0, `found ${n}`);
    return finish();
  } finally {
    if (tId) {
      try { await teardownTenant(tId); } catch (e) { console.error("[check-cost-plus-doc-gate] teardown warning:", e); }
    }
    console.log("[check-cost-plus-doc-gate] teardown complete");
  }
}

function finish() {
  console.log("");
  console.log(`[check-cost-plus-doc-gate] passed: ${passed}`);
  console.log(`[check-cost-plus-doc-gate] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-cost-plus-doc-gate] COST-PLUS-DOC-GATE LEDGER RED ✗");
  } else {
    console.log("[check-cost-plus-doc-gate] COST-PLUS-DOC-GATE LEDGER GREEN ✓ (warn: cost_plus+toggle+source-VI+no-doc / signoff doesn't satisfy / effective-model / toggle+rate_sheet+manual skip / override recorded only when acked)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => { console.error("[check-cost-plus-doc-gate] FAILED:", e); process.exit(1); });
