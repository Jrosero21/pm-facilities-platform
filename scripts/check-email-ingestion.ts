/**
 * scripts/check-email-ingestion.ts — Phase 13 (13i) PHASE-BLOCKING HARNESS
 *
 * Empirically discharges Phase 13's banked guarantees (~20 assertions, A–F): reader seam
 * (parser_kind registry), ingestEmail record-don't-apply, dedup flag-don't-reject (OQ-13.4),
 * approve happy-path (draft→job, D-5), readiness/reject/tenant-isolation, and the D-7
 * config-only-parser-rules schema invariant.
 *
 * SANDBOX ONLY — hard-guarded by the _sandbox name check below. DESTRUCTIVE +
 * RE-SEED-FIRST: run the phase-9 sandbox seed AND the system-user seed before this. The
 * harness reuses the seeded T-A (Acme client/location/priority + global NEW/HVAC) and builds
 * its OWN T-B for isolation, then tears down everything it created in a finally block so a
 * re-run starts clean. Mirrors scripts/check-external-integrations.ts (Phase 12).
 *
 * Run: npm run db:check:email-ingestion   (after re-seeding sandbox)
 */

// Module marker: these check-* scripts declare top-level names (originalUrl/passed/check/…)
// at file scope. Without an import/export a .ts file is a global SCRIPT in TS, so two such
// scripts would collide on those names under whole-project `tsc`. `export {}` makes this a
// MODULE (isolated scope) — runtime is unaffected (tsx runs the top-level statements as-is).
export {};

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-email] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[check-email] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;

// -------- Tiny assertion framework --------
let passed = 0;
const failed: string[] = [];
function check(label: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed.push(label);
    console.error(`  ✗ ${label}`);
  }
}

const T_B_SLUG = "phase13-harness-tenant-b";
const SEED_TENANT_SLUG = "phase9-seed-tenant";

/** MariaDB json() round-trips as a raw STRING on read; parse at the boundary. */
function parseMeta(m: unknown): Record<string, unknown> {
  return typeof m === "string" ? JSON.parse(m) : ((m ?? {}) as Record<string, unknown>);
}

async function main() {
  const { v7: uuidv7 } = await import("uuid");
  const { db } = await import("@/server/db");
  const {
    tenants, clients, clientLocations, priorities, jobStatuses, trades, jobs, users,
    inboundEmails, emailParseResults, emailWorkOrderDrafts,
  } = await import("@/server/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { getSystemUserId } = await import("@/server/integrations/system-user");
  const { ingestEmail, approveEmailDraft, rejectEmailDraft } = await import(
    "@/server/integrations/ingest-email"
  );
  // Side-effect import registers the two stub readers into the seam.
  await import("@/lib/integrations/email");
  const { getReader, listRegisteredReaders } = await import(
    "@/lib/integrations/email/core/registry"
  );

  // Track created rows for teardown.
  const createdInboundIds: string[] = [];
  let tBId: string | null = null;

  async function teardown() {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
        // Everything the harness inserted under T-A hangs off inbound_emails (drafts +
        // parse_results FK→inbound_emails) + any jobs it created via approve.
        if (createdInboundIds.length) {
          for (const iid of createdInboundIds) {
            await tx.delete(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.inboundEmailId, iid));
            await tx.delete(emailParseResults).where(eq(emailParseResults.inboundEmailId, iid));
            await tx.delete(inboundEmails).where(eq(inboundEmails.id, iid));
          }
        }
        if (tBId) {
          // T-B is fully harness-owned — purge its email rows + topology, then the tenant.
          await tx.delete(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.tenantId, tBId));
          await tx.delete(emailParseResults).where(eq(emailParseResults.tenantId, tBId));
          await tx.delete(inboundEmails).where(eq(inboundEmails.tenantId, tBId));
          await tx.delete(jobs).where(eq(jobs.tenantId, tBId));
          await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tBId));
          await tx.delete(clients).where(eq(clients.tenantId, tBId));
          await tx.delete(priorities).where(eq(priorities.tenantId, tBId));
          await tx.delete(tenants).where(eq(tenants.id, tBId));
        }
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      });
    } catch (e) {
      console.error("[check-email] teardown warning:", e);
    }
  }

  // Defensive pre-clean: drop a leftover T-B from a prior aborted run.
  {
    const prior = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, T_B_SLUG)).limit(1);
    if (prior[0]) {
      tBId = prior[0].id;
      await teardown();
      tBId = null;
    }
    // Also drop any leftover harness inbound rows (subject marker) from an aborted run.
    const leftover = await db.select({ id: inboundEmails.id }).from(inboundEmails).where(eq(inboundEmails.fromAddress, "harness@phase13.test"));
    if (leftover.length) {
      createdInboundIds.push(...leftover.map((r) => r.id));
      await teardown();
      createdInboundIds.length = 0;
    }
  }

  // A small helper to insert an inbound_emails row (T-A) and track it for teardown.
  async function seedInbound(opts: {
    tenantId: string;
    messageId: string | null;
    subject?: string;
  }): Promise<string> {
    const id = uuidv7();
    await db.insert(inboundEmails).values({
      id,
      tenantId: opts.tenantId,
      messageId: opts.messageId,
      fromAddress: "harness@phase13.test",
      toAddress: "intake@phase13.test",
      subject: opts.subject ?? "Harness WO",
      bodyText: "please fix the thing",
      processingStatus: "received",
    });
    createdInboundIds.push(id);
    return id;
  }

  try {
    console.log("\n[setup] resolve T-A (seeded) + system user + build T-B");
    const systemUserId = await getSystemUserId(); // throws SYSTEM_USER_NOT_SEEDED if absent

    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG));
    check("setup: seeded tenant (T-A) exists", !!tA);
    if (!tA) return finish();
    const tAId = tA.id;

    const [acme] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tAId), eq(clients.name, "Acme Corp")));
    if (!acme) { check("setup: T-A Acme client", false); return finish(); }
    const [acmeLoc] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tAId), eq(clientLocations.clientId, acme.id))).limit(1);
    const [emergencyA] = await db.select({ id: priorities.id }).from(priorities).where(and(eq(priorities.tenantId, tAId), eq(priorities.code, "EMERGENCY")));
    const [newStatus] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
    const [hvac] = await db.select({ id: trades.id }).from(trades).where(eq(trades.code, "HVAC"));
    if (!acmeLoc || !emergencyA || !newStatus || !hvac) { check("setup: T-A location/priority + global NEW/HVAC", false); return finish(); }

    const [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "operator@phase9seed.test"));
    if (!operator) { check("setup: seeded operator user", false); return finish(); }
    const operatorId = operator.id;

    // T-B: created in-harness for isolation.
    tBId = uuidv7();
    await db.insert(tenants).values({ id: tBId, name: "Phase13 Harness Tenant B", slug: T_B_SLUG, type: "aggregator", status: "active" });

    // ════════ A. READER SEAM ════════
    console.log("\n[A] reader seam");
    let detResolves = false;
    let aiResolves = false;
    try { detResolves = !!getReader("deterministic"); } catch { detResolves = false; }
    try { aiResolves = !!getReader("ai_assist"); } catch { aiResolves = false; }
    check("A1: getReader('deterministic') + ('ai_assist') resolve", detResolves && aiResolves);
    const kinds = listRegisteredReaders();
    check("A2: listRegisteredReaders() contains both kinds",
      kinds.includes("deterministic") && kinds.includes("ai_assist"));
    let bogusThrew = false;
    try {
      // @ts-expect-error — intentionally passing an invalid kind to assert the throw.
      getReader("bogus");
    } catch (e) {
      bogusThrew = e instanceof Error && e.message.includes("UNKNOWN_PARSER_KIND");
    }
    check("A3: getReader('bogus') throws UNKNOWN_PARSER_KIND", bogusThrew);

    // ════════ B. ingestEmail RECORD-DON'T-APPLY ════════
    console.log("\n[B] ingestEmail record-don't-apply");
    const jobsBeforeB = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    const inB = await seedInbound({ tenantId: tAId, messageId: "MID-B-1", subject: "B ingest" });
    const rB = await ingestEmail({ inboundEmailId: inB });
    check("B1: ingestEmail outcome = drafted", rB.outcome === "drafted");
    const [prB] = await db.select().from(emailParseResults).where(eq(emailParseResults.inboundEmailId, inB));
    check("B2: email_parse_results row (deterministic / failed / confidence 0, stub)",
      prB?.parserKind === "deterministic" && prB?.parseOutcome === "failed" && Number(prB?.confidence) === 0);
    const [drB] = await db.select().from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.inboundEmailId, inB));
    check("B3: email_work_order_drafts @ pending_review, resolved_client_id NULL (stub)",
      drB?.draftStatus === "pending_review" && drB?.resolvedClientId === null);
    const jobsAfterB = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    const [inBRow] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inB));
    check("B4: NO job created at ingest + inbound processing_status='drafted'",
      jobsAfterB === jobsBeforeB && inBRow?.processingStatus === "drafted");

    // ════════ C. DEDUP flag-don't-reject (OQ-13.4) ════════
    console.log("\n[C] dedup flag-don't-reject");
    const inC = await seedInbound({ tenantId: tAId, messageId: "MID-B-1", subject: "C dup" }); // SAME message_id as inB
    const draftsBeforeC = (await db.select({ id: emailWorkOrderDrafts.id }).from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.tenantId, tAId))).length;
    const rC = await ingestEmail({ inboundEmailId: inC });
    const [inCRow] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inC));
    const draftsAfterC = (await db.select({ id: emailWorkOrderDrafts.id }).from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.tenantId, tAId))).length;
    check("C1: duplicate message_id → duplicate_flagged, status set, NO new draft",
      rC.outcome === "duplicate_flagged" && inCRow?.processingStatus === "duplicate_flagged" && draftsAfterC === draftsBeforeC);
    check("C2: the duplicate inbound row still exists (stored, not hard-deleted)", !!inCRow);
    const dedupIdx = await db.execute(sql`
      SELECT NON_UNIQUE FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = 'jonnyrosero_pm_sandbox'
        AND TABLE_NAME = 'inbound_emails'
        AND INDEX_NAME = 'inbound_emails_tenant_message_idx'
      LIMIT 1
    `);
    // mysql2 execute → [rows, fields]; NON_UNIQUE=1 means non-unique (flag-don't-reject).
    const dedupRows = (dedupIdx as unknown as [Array<{ NON_UNIQUE: number }>, unknown])[0];
    check("C3: inbound_emails_tenant_message_idx is NON_UNIQUE=1 (OQ-13.4 regression guard)",
      dedupRows.length === 1 && Number(dedupRows[0].NON_UNIQUE) === 1);

    // ════════ D. APPROVE happy-path (HAND-RESOLVED) ════════
    console.log("\n[D] approve happy-path (hand-resolved draft)");
    // Build an inbound row + a draft with resolved_* set — COMMENT: this simulates the
    // post-resolution state a real reader (CF-13.3) or an operator would produce. It tests
    // approveEmailDraft's job-creation, NOT the (stubbed) parser.
    const inD = await seedInbound({ tenantId: tAId, messageId: "MID-D-1", subject: "D approve" });
    const draftDId = uuidv7();
    await db.insert(emailWorkOrderDrafts).values({
      id: draftDId,
      tenantId: tAId,
      inboundEmailId: inD,
      parseResultId: null,
      draftStatus: "pending_review",
      sourceType: "email_ingestion",
      problemDescription: "no heat in unit 4",
      resolvedClientId: acme.id,
      resolvedClientLocationId: acmeLoc.id,
      resolvedPriorityId: emergencyA.id,
    });
    const rD = await approveEmailDraft({ tenantId: tAId, draftId: draftDId, reviewedByUserId: operatorId });
    check("D1: approveEmailDraft returns a jobId", !!rD.jobId);
    const [jobD] = await db.select().from(jobs).where(eq(jobs.id, rD.jobId));
    check("D2: job created — sourceType email_ingestion, createdBy=system, status NEW",
      jobD?.sourceType === "email_ingestion" && jobD?.createdByUserId === systemUserId && jobD?.currentStatusId === newStatus.id);
    const [drD] = await db.select().from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.id, draftDId));
    check("D3: draft → approved, created_job_id set, reviewer=operator, reviewed_at set",
      drD?.draftStatus === "approved" && drD?.createdJobId === rD.jobId && drD?.reviewedByUserId === operatorId && !!drD?.reviewedAt);
    check("D4: job sourceExternalId === the inbound row's message_id", jobD?.sourceExternalId === "MID-D-1");

    // ════════ E. READINESS + REJECT + ISOLATION ════════
    console.log("\n[E] readiness + reject + isolation");
    // E1 — approve a null-client draft → DRAFT_CLIENT_UNRESOLVED, no job
    const inE1 = await seedInbound({ tenantId: tAId, messageId: "MID-E-1" });
    const draftE1 = uuidv7();
    await db.insert(emailWorkOrderDrafts).values({ id: draftE1, tenantId: tAId, inboundEmailId: inE1, draftStatus: "pending_review", sourceType: "email_ingestion" });
    const jobsBeforeE1 = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    let e1Code = "";
    try { await approveEmailDraft({ tenantId: tAId, draftId: draftE1, reviewedByUserId: operatorId }); } catch (e) { e1Code = e instanceof Error ? e.message : String(e); }
    const jobsAfterE1 = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.tenantId, tAId))).length;
    check("E1: approve null-client draft → DRAFT_CLIENT_UNRESOLVED, no job",
      e1Code === "DRAFT_CLIENT_UNRESOLVED" && jobsAfterE1 === jobsBeforeE1);

    // E2 — client set, location null → DRAFT_LOCATION_UNRESOLVED
    const inE2 = await seedInbound({ tenantId: tAId, messageId: "MID-E-2" });
    const draftE2 = uuidv7();
    await db.insert(emailWorkOrderDrafts).values({ id: draftE2, tenantId: tAId, inboundEmailId: inE2, draftStatus: "pending_review", sourceType: "email_ingestion", resolvedClientId: acme.id });
    let e2Code = "";
    try { await approveEmailDraft({ tenantId: tAId, draftId: draftE2, reviewedByUserId: operatorId }); } catch (e) { e2Code = e instanceof Error ? e.message : String(e); }
    check("E2: approve client-set/null-location draft → DRAFT_LOCATION_UNRESOLVED", e2Code === "DRAFT_LOCATION_UNRESOLVED");

    // E3 — reject a pending draft → rejected, no job
    const inE3 = await seedInbound({ tenantId: tAId, messageId: "MID-E-3" });
    const draftE3 = uuidv7();
    await db.insert(emailWorkOrderDrafts).values({ id: draftE3, tenantId: tAId, inboundEmailId: inE3, draftStatus: "pending_review", sourceType: "email_ingestion" });
    await rejectEmailDraft({ tenantId: tAId, draftId: draftE3, reviewedByUserId: operatorId, reason: "spam" });
    const [drE3] = await db.select().from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.id, draftE3));
    check("E3: rejectEmailDraft → draft_status='rejected', reviewer set", drE3?.draftStatus === "rejected" && drE3?.reviewedByUserId === operatorId);

    // E4 — approve the already-approved D draft → DRAFT_NOT_PENDING_REVIEW
    let e4Code = "";
    try { await approveEmailDraft({ tenantId: tAId, draftId: draftDId, reviewedByUserId: operatorId }); } catch (e) { e4Code = e instanceof Error ? e.message : String(e); }
    check("E4: approve already-approved draft → DRAFT_NOT_PENDING_REVIEW", e4Code === "DRAFT_NOT_PENDING_REVIEW");

    // E5 — cross-tenant: approve a T-A draft as T-B → DRAFT_NOT_FOUND (tenant-scoped SELECT)
    const inE5 = await seedInbound({ tenantId: tAId, messageId: "MID-E-5" });
    const draftE5 = uuidv7();
    await db.insert(emailWorkOrderDrafts).values({ id: draftE5, tenantId: tAId, inboundEmailId: inE5, draftStatus: "pending_review", sourceType: "email_ingestion", resolvedClientId: acme.id, resolvedClientLocationId: acmeLoc.id });
    let e5Code = "";
    try { await approveEmailDraft({ tenantId: tBId, draftId: draftE5, reviewedByUserId: operatorId }); } catch (e) { e5Code = e instanceof Error ? e.message : String(e); }
    check("E5: cross-tenant approve (T-B on T-A draft) → DRAFT_NOT_FOUND", e5Code === "DRAFT_NOT_FOUND");

    // ════════ F. D-7 SCHEMA INVARIANT ════════
    console.log("\n[F] D-7 config-only parser rules");
    const cols = await db.execute(sql`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'jonnyrosero_pm_sandbox' AND TABLE_NAME = 'email_parser_rules'
    `);
    const colRows = (cols as unknown as [Array<{ COLUMN_NAME: string }>, unknown])[0];
    const colNames = colRows.map((r) => r.COLUMN_NAME.toLowerCase());
    const fkConstraints = await db.execute(sql`
      SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'jonnyrosero_pm_sandbox' AND TABLE_NAME = 'email_parser_rules'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    const fkRows = (fkConstraints as unknown as [Array<{ REFERENCED_TABLE_NAME: string }>, unknown])[0];
    const refsClients = fkRows.some((r) => r.REFERENCED_TABLE_NAME === "clients");
    const hasClientCol = colNames.some((c) => c === "client_id" || c.includes("client"));
    check("F1: email_parser_rules is config-only — no client_id column, no FK to clients (D-7)",
      !hasClientCol && !refsClients);

    return finish();
  } finally {
    await teardown();
    console.log("[check-email] teardown complete (T-B + harness email rows removed)");
  }
}

function finish() {
  console.log("");
  console.log(`[check-email] passed: ${passed}`);
  console.log(`[check-email] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-email] PHASE-BLOCKING LEDGER RED ✗ — PHASE BLOCKED");
  } else {
    console.log("[check-email] PHASE-BLOCKING LEDGER GREEN ✓ (reader seam / record-don't-apply / dedup flag-not-reject / approve+job / readiness+reject+isolation / D-7)");
  }
}

main()
  .then(() => process.exit(failed.length > 0 ? 1 : 0))
  .catch((e) => {
    console.error("[check-email] FAILED:", e);
    process.exit(1);
  });
