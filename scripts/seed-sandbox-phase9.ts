/**
 * Phase 9 (9d) — SANDBOX SEED (retained). Builds the canonical "populated tenant" for the
 * analytics dashboard + the retained reader harness (check-analytics-readers.ts).
 *
 * SANDBOX-ONLY. This script derives the sandbox DATABASE_URL from the configured one (swaps the
 * db name to *_sandbox), sets it BEFORE dynamically importing @/server/db|auth, and HARD-ABORTS
 * unless the resolved URL targets a *_sandbox database. All writes go to the sandbox. During the
 * 9d.3 gate phase a sibling script read production information_schema READ-ONLY; this seed never
 * writes prod. (Schema-table imports below are static — they carry no DB connection, so they bind
 * nothing; only db + auth are dynamically imported after the DATABASE_URL override.)
 *
 * Three-stage pipeline (manifest §2): (1) drizzle-kit migrate replay → (2) global reference seeds
 * (trades, dispatch-reference) → (3) in-process operational seed (reset → tenant → job-reference →
 * roles/users → topology → jobs+history+assignments+checkins+invoices). Idempotent (manifest §4):
 * reset = DELETE audit_logs (SET-NULL FK) then DELETE tenant (cascades the 66 CASCADE tables).
 *
 * Run: npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts
 */
import { execSync } from "node:child_process";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import {
  tenants, tenantUsers, userRoles, roles, users,
  clients, clientLocations, vendors, vendorLocations, vendorUsers,
  jobs, jobNotes, jobAttachments, jobStatusHistory, jobVendorAssignments, vendorCheckIns,
  vendorInvoices, clientInvoices,
  jobStatuses, priorities, trades, dispatchAssignmentStatuses,
  auditLogs, tenantJobSequences,
} from "@/server/schema";
import {
  SEED_TENANT, SEED_USERS, SEED_USER_PASSWORD,
  CLIENTS, VENDORS, OPEN_JOBS, CLOSED_JOBS, VENDOR_INVOICES, CLIENT_INVOICES,
  SEED_VENDOR_USER, VENDOR_NOTES_FIXTURE, VENDOR_PHOTO_PLACEHOLDERS_FIXTURE,
  VENDOR_INVOICE_FIXTURE,
} from "./seed-sandbox-phase9-fixture";

// ── Sandbox guard (BEFORE dynamically importing db/auth) ──────────────────────────────
const configured = process.env.DATABASE_URL;
if (!configured) throw new Error("DATABASE_URL not set");
const SANDBOX_URL = configured.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!SANDBOX_URL.includes("jonnyrosero_pm_sandbox")) {
  throw new Error("seed-sandbox-phase9 refuses to run: resolved URL is not a *_sandbox DB.");
}
process.env.DATABASE_URL = SANDBOX_URL; // bind db/auth to sandbox + flow to child env
console.log(`[seed9d] sandbox target: ${SANDBOX_URL.replace(/.*@/, "...@")}`);

const { db } = await import("@/server/db");
const { auth } = await import("@/server/auth");
// Dynamic (post-env-swap): recordVendorInvoice statically imports db, so importing
// it before the swap would bind it to prod. Used by the 10n vendor-invoice fixture.
const { recordVendorInvoice } = await import("@/server/billing/vendor-invoices");

const childEnv = { ...process.env };
function shell(cmd: string, extraEnv: Record<string, string> = {}) {
  console.log(`[seed9d] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...childEnv, ...extraEnv } });
}
// Anchor every seeded timestamp to the DB clock via a SQL interval, NOT a client-side JS Date.
// WHY (9d.6 finding): the mysql2 pool is created without a `timezone` option → it serializes JS Dates
// in the Node-process timezone, but the analytics readers compute dwell against the server's NOW()
// (session tz = SYSTEM). The mismatch skews every seeded timestamp by hours, flipping boundary cases
// (e.g. a "6h-old" NEW job landing right at the 4h stall threshold). Expressing offsets as
// `NOW() - INTERVAL n SECOND` keeps the stored value and the reader's NOW() in the SAME frame, so a
// seeded age maps to exactly that dwell regardless of client/server TZ. `secondsAgo` may be negative
// (= future, for scheduled-start / due dates). Production is unaffected — it uses DB-default
// CURRENT_TIMESTAMP, never client-supplied historical Dates.
const agoSql = (secondsAgo: number) => sql`(NOW() - INTERVAL ${Math.round(secondsAgo)} SECOND)`;

async function main() {
  // ── Stage 1 — schema replay (idempotent) ──
  console.log("\n[seed9d] === Stage 1: schema replay ===");
  shell("npx drizzle-kit migrate");

  // ── Stage 2 — global reference seeds (tenant-independent) ──
  console.log("\n[seed9d] === Stage 2: global reference seeds ===");
  shell("npx tsx db/seeds/trades.ts");
  shell("npx tsx db/seeds/dispatch-reference.ts");

  // ── Stage 3a — idempotency reset ──
  console.log("\n[seed9d] === Stage 3a: reset ===");
  const existing = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SEED_TENANT.slug)).limit(1);
  if (existing.length) {
    const tid = existing[0].id;
    // EXPLICIT per-table tenant-scoped deletes (child → parent), NOT a single tenant-cascade.
    // The tenant_id FKs are all CASCADE (Gate 1), but INTER-CHILD RESTRICT FKs (e.g.
    // jobs.client_location_id → client_locations, NO ACTION) make InnoDB unable to order a single
    // tenant-cascade's children safely — `DELETE FROM tenants` raises ER_ROW_IS_REFERENCED_2.
    // Gate 1 checked tenant_id FKs only, so it didn't surface this; the 9d.5 populated-reset did.
    // FOREIGN_KEY_CHECKS=0 makes the explicit deletes order-independent + robust (sandbox-only).
    // This also deletes audit_logs explicitly (subsumes the SET-NULL pre-delete — no orphans).
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
      await tx.delete(vendorCheckIns).where(eq(vendorCheckIns.tenantId, tid));
      await tx.delete(jobVendorAssignments).where(eq(jobVendorAssignments.tenantId, tid));
      await tx.delete(jobStatusHistory).where(eq(jobStatusHistory.tenantId, tid));
      await tx.delete(vendorInvoices).where(eq(vendorInvoices.tenantId, tid));
      await tx.delete(clientInvoices).where(eq(clientInvoices.tenantId, tid));
      await tx.delete(jobs).where(eq(jobs.tenantId, tid));
      await tx.delete(clientLocations).where(eq(clientLocations.tenantId, tid));
      await tx.delete(clients).where(eq(clients.tenantId, tid));
      await tx.delete(vendorLocations).where(eq(vendorLocations.tenantId, tid));
      await tx.delete(vendors).where(eq(vendors.tenantId, tid));
      await tx.delete(priorities).where(eq(priorities.tenantId, tid));
      await tx.delete(tenantJobSequences).where(eq(tenantJobSequences.tenantId, tid));
      await tx.delete(tenantUsers).where(eq(tenantUsers.tenantId, tid));
      await tx.delete(userRoles).where(eq(userRoles.tenantId, tid));
      await tx.delete(auditLogs).where(eq(auditLogs.tenantId, tid));
      await tx.delete(tenants).where(eq(tenants.id, tid));
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    });
    const after = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tid));
    console.log(`[seed9d] reset: deleted prior seed tenant ${tid} (post-delete tenant rows: ${after.length})`);
  } else {
    console.log("[seed9d] reset: no prior seed tenant");
  }

  // ── Stage 3b — create seed tenant ──
  const tenantId = uuidv7();
  await db.insert(tenants).values({ id: tenantId, name: SEED_TENANT.name, slug: SEED_TENANT.slug, type: "aggregator", status: "active" });
  console.log(`[seed9d] tenant created: ${tenantId}`);

  // ── Stage 3c — tenant reference seed (priorities + global statuses + sequence) ──
  console.log("\n[seed9d] === Stage 3c: job-reference (priorities/statuses/sequence) ===");
  shell("npx tsx db/seeds/job-reference.ts", { SEED_TENANT_SLUG: SEED_TENANT.slug });

  // ── Stage 3c.5 — ensure roles (global; not seeded by trades/dispatch/job-reference) ──
  const ROLE_DEFS = [
    { key: "super_admin", label: "Super Admin", scope: "global" as const },
    { key: "tenant_admin", label: "Tenant Admin", scope: "tenant" as const },
    { key: "operator", label: "Operator", scope: "tenant" as const },
    { key: "accounting", label: "Accounting", scope: "tenant" as const },
    { key: "vendor_user", label: "Vendor User", scope: "tenant" as const },
    { key: "client_user", label: "Client User", scope: "tenant" as const },
  ];
  for (const r of ROLE_DEFS) {
    const ex = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, r.key)).limit(1);
    if (!ex.length) await db.insert(roles).values(r);
  }
  const roleByKey = new Map((await db.select({ key: roles.key, id: roles.id }).from(roles)).map((r) => [r.key, r.id]));

  // ── Stage 3d — users (upsert-by-email) + membership + roles ──
  console.log("\n[seed9d] === Stage 3d: users ===");
  for (const u of SEED_USERS) {
    let row = (await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1))[0];
    if (!row) {
      await auth.api.signUpEmail({ body: { email: u.email, password: SEED_USER_PASSWORD, name: u.name } });
      row = (await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1))[0];
      console.log(`[seed9d] user created: ${u.email}`);
    } else {
      console.log(`[seed9d] user reused: ${u.email}`);
    }
    await db.insert(tenantUsers).values({ tenantId, userId: row.id, status: "active" });
    await db.insert(userRoles).values({ userId: row.id, roleId: roleByKey.get(u.roleKey)!, tenantId });
  }
  const adminId = (await db.select({ id: users.id }).from(users).where(eq(users.email, SEED_USERS[0].email)).limit(1))[0]!.id;

  // ── reference id maps ──
  const statusByCode = new Map((await db.select({ c: jobStatuses.code, id: jobStatuses.id }).from(jobStatuses)).map((r) => [r.c, r.id]));
  const tradeByCode = new Map((await db.select({ c: trades.code, id: trades.id }).from(trades)).map((r) => [r.c, r.id]));
  const prioByCode = new Map((await db.select({ c: priorities.code, id: priorities.id }).from(priorities).where(eq(priorities.tenantId, tenantId))).map((r) => [r.c, r.id]));
  const dispatchByCode = new Map((await db.select({ c: dispatchAssignmentStatuses.code, id: dispatchAssignmentStatuses.id }).from(dispatchAssignmentStatuses)).map((r) => [r.c, r.id]));

  // ── Stage 3e.1 — topology ──
  console.log("\n[seed9d] === Stage 3e: topology + jobs + billing ===");
  const clientId = new Map<string, string>();
  const locId = new Map<string, string>();
  for (const c of CLIENTS) {
    const cid = uuidv7();
    clientId.set(c.key, cid);
    await db.insert(clients).values({ id: cid, tenantId, name: c.name });
    for (let idx = 0; idx < c.locations.length; idx++) {
      const lid = uuidv7();
      locId.set(`${c.key}:${idx}`, lid);
      await db.insert(clientLocations).values({ id: lid, tenantId, clientId: cid, name: c.locations[idx], addressLine1: `${idx + 1} Main St`, city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
    }
  }
  const vendorList: string[] = [];
  for (const v of VENDORS) {
    const vid = uuidv7();
    vendorList.push(vid);
    await db.insert(vendors).values({ id: vid, tenantId, name: v.name });
    await db.insert(vendorLocations).values({ id: uuidv7(), tenantId, vendorId: vid, name: `${v.name} HQ`, addressLine1: "10 Depot Rd", city: "Metropolis", stateProvince: "NY", postalCode: "10001" });
  }

  // ── Stage 3e.1b — Phase 10 (10j) vendor portal user + vendor_users mapping ──
  // One vendor user bound to the alphabetically-first seeded vendor (CoolAir).
  // Mirrors the Stage-3d user upsert (auth.api.signUpEmail + re-select by email;
  // better-auth assigns the id). Grants tenant membership + vendor_user role,
  // then maps the user to the bound vendor in vendor_users. The bound vendor id
  // comes from this seed's in-process vendorList (the fixture holds no ids).
  {
    let vuRow = (await db.select({ id: users.id }).from(users).where(eq(users.email, SEED_VENDOR_USER.email)).limit(1))[0];
    if (!vuRow) {
      await auth.api.signUpEmail({ body: { email: SEED_VENDOR_USER.email, password: SEED_USER_PASSWORD, name: SEED_VENDOR_USER.name } });
      vuRow = (await db.select({ id: users.id }).from(users).where(eq(users.email, SEED_VENDOR_USER.email)).limit(1))[0];
      console.log(`[seed9d] vendor user created: ${SEED_VENDOR_USER.email}`);
    } else {
      console.log(`[seed9d] vendor user reused: ${SEED_VENDOR_USER.email}`);
    }
    await db.insert(tenantUsers).values({ tenantId, userId: vuRow.id, status: "active" });
    await db.insert(userRoles).values({ userId: vuRow.id, roleId: roleByKey.get(SEED_VENDOR_USER.roleKey)!, tenantId });
    const boundIdx = VENDORS.findIndex((v) => v.key === SEED_VENDOR_USER.boundVendorKey);
    await db.insert(vendorUsers).values({ tenantId, userId: vuRow.id, vendorId: vendorList[boundIdx] });
    console.log(`[seed9d] vendor_users mapping: ${SEED_VENDOR_USER.email} -> vendor ${vendorList[boundIdx]}`);
  }

  // ── Stage 3e.2 — jobs ──
  let jobNum = 0;
  const closedJobRefs: { jobId: string; clientId: string }[] = [];

  // 10k-actions: seed exactly ONE bound-vendor (CoolAir) assignment in SENT state
  // (sent_at set) so the harness can exercise acceptDispatch. The first CoolAir
  // assignment the round-robin lands on becomes SENT; the rest stay ACCEPTED.
  const sentBoundVendorId = vendorList[VENDORS.findIndex((v) => v.key === SEED_VENDOR_USER.boundVendorKey)];
  let sentSeeded = false;

  for (const j of OPEN_JOBS) {
    jobNum++;
    const jid = uuidv7();
    const enteredSecsAgo = j.ageHours * 3600;
    const enteredAt = agoSql(enteredSecsAgo);
    await db.insert(jobs).values({
      id: jid, tenantId, jobNumber: jobNum, clientId: clientId.get(j.clientKey)!,
      clientLocationId: locId.get(`${j.clientKey}:${j.locIndex}`)!,
      currentStatusId: statusByCode.get(j.statusCode)!,
      primaryTradeId: j.tradeCode ? tradeByCode.get(j.tradeCode)! : null,
      priorityId: j.priorityCode ? prioByCode.get(j.priorityCode)! : null,
      problemDescription: `Seed open job ${j.key} (${j.statusCode})`,
      scheduledStartAt: j.scheduledStartHours !== null ? agoSql(-j.scheduledStartHours * 3600) : null,
      dueAt: j.dueHours !== null ? agoSql(-j.dueHours * 3600) : null,
      createdByUserId: adminId, createdAt: enteredAt, updatedAt: enteredAt,
    });
    await db.insert(jobStatusHistory).values({ tenantId, jobId: jid, fromStatusId: null, toStatusId: statusByCode.get(j.statusCode)!, changedByUserId: adminId, createdAt: enteredAt });
    for (let a = 0; a < j.assignments; a++) {
      const aid = uuidv7();
      const asnCreated = agoSql(enteredSecsAgo - 3600); // +1h after entry → ttd interval = 3600s
      const thisVendorId = vendorList[(jobNum + a) % vendorList.length];
      const makeSent = !sentSeeded && thisVendorId === sentBoundVendorId;
      await db.insert(jobVendorAssignments).values({
        id: aid, tenantId, jobId: jid, vendorId: thisVendorId,
        currentStatusId: makeSent ? dispatchByCode.get("SENT")! : dispatchByCode.get("ACCEPTED")!,
        sentAt: makeSent ? asnCreated : null,
        matchedTradeId: tradeByCode.get(j.tradeCode ?? "HVAC")!, matchedTradeWasPrimary: true,
        tightestGeoAtDispatch: "national", matchedGeoTypesAtDispatch: ["national"], complianceStatusAtDispatch: "no_data",
        createdByUserId: adminId, createdAt: asnCreated, updatedAt: asnCreated,
      });
      if (makeSent) sentSeeded = true;
      if (a === 0 && j.checkIn) {
        await db.insert(vendorCheckIns).values({ tenantId, assignmentId: aid, occurredAt: asnCreated, recordedByUserId: adminId });
      }
    }
  }

  // ── Stage 3e.2b — Phase 10 (10l) vendor notes ──
  // 4 notes on the bound vendor's EARLIEST assignment's parent job (stable target:
  // notes are job-scoped + the read filter is status-agnostic, so the SENT
  // assignment being consumed by the actions harness doesn't matter). Exercises
  // the DoR-10l.2 vendor-visibility filter. operator-origin notes are authored by
  // adminId (author doesn't affect their visibility-only filter); the vendor note
  // is authored by the seeded vendor user.
  {
    const coolVendorId = vendorList[VENDORS.findIndex((v) => v.key === SEED_VENDOR_USER.boundVendorKey)];
    const [firstCoolAsn] = await db
      .select({ id: jobVendorAssignments.id, jobId: jobVendorAssignments.jobId })
      .from(jobVendorAssignments)
      .where(and(eq(jobVendorAssignments.tenantId, tenantId), eq(jobVendorAssignments.vendorId, coolVendorId)))
      .orderBy(jobVendorAssignments.createdAt, jobVendorAssignments.id)
      .limit(1);
    const noteJobId = firstCoolAsn.jobId;
    const vendorUserId = (await db.select({ id: users.id }).from(users).where(eq(users.email, SEED_VENDOR_USER.email)).limit(1))[0]!.id;
    for (const n of VENDOR_NOTES_FIXTURE) {
      await db.insert(jobNotes).values({
        id: uuidv7(), tenantId, jobId: noteJobId,
        body: n.bodyMarker, visibility: n.visibility, origin: n.origin,
        createdByUserId: n.authorRoleKey === "vendor_user" ? vendorUserId : adminId,
      });
    }
    console.log(`[seed9d] vendor notes: ${VENDOR_NOTES_FIXTURE.length} on job ${noteJobId}`);

    // 10m: vendor photo placeholders on the same job (NULL file_url markers).
    for (const p of VENDOR_PHOTO_PLACEHOLDERS_FIXTURE) {
      await db.insert(jobAttachments).values({
        id: uuidv7(), tenantId, jobId: noteJobId,
        title: p.titleMarker, attachmentType: "photo", visibility: "internal_only",
        uploadedByUserId: vendorUserId,
      });
    }
    console.log(`[seed9d] vendor photo placeholders: ${VENDOR_PHOTO_PLACEHOLDERS_FIXTURE.length} on job ${noteJobId}`);

    // 10n: one vendor_portal-source invoice via the canonical writer (totals +
    // NTE governance + billing event come for free; shape == real submissions).
    const seedInv = await recordVendorInvoice({
      tenantId,
      jobId: noteJobId,
      vendorId: coolVendorId,
      assignmentId: firstCoolAsn.id,
      sourceType: "vendor_portal",
      invoiceNumber: VENDOR_INVOICE_FIXTURE.invoiceNumber,
      createdByUserId: vendorUserId,
      lineItems: VENDOR_INVOICE_FIXTURE.lines.map((l) => ({
        category: l.category,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });
    console.log(`[seed9d] vendor invoice: ${seedInv.id} (${VENDOR_INVOICE_FIXTURE.invoiceNumber}) on job ${noteJobId}`);
  }

  for (const cj of CLOSED_JOBS) {
    jobNum++;
    const jid = uuidv7();
    const totalHours = cj.chain.reduce((s, seg) => s + seg.hours, 0);
    const finalStatus = cj.chain[cj.chain.length - 1].code;
    await db.insert(jobs).values({
      id: jid, tenantId, jobNumber: jobNum, clientId: clientId.get(cj.clientKey)!,
      clientLocationId: locId.get(`${cj.clientKey}:0`)!,
      currentStatusId: statusByCode.get(finalStatus)!,
      primaryTradeId: tradeByCode.get(cj.tradeCode)!,
      problemDescription: `Seed closed job ${cj.key} (${finalStatus})`,
      completedAt: finalStatus === "COMPLETED" ? agoSql(3600) : null,
      createdByUserId: adminId, createdAt: agoSql((totalHours + 1) * 3600), updatedAt: agoSql(3600),
    });
    // History rows backdated relative to the DB clock: row k sits (totalHours + 1 − cumulative) hours
    // ago, so consecutive rows are exactly seg.hours apart (the completed-interval the readers measure).
    let cumulativeHours = 0;
    let prev: string | null = null;
    for (const seg of cj.chain) {
      await db.insert(jobStatusHistory).values({ tenantId, jobId: jid, fromStatusId: prev, toStatusId: statusByCode.get(seg.code)!, changedByUserId: adminId, createdAt: agoSql((totalHours + 1 - cumulativeHours) * 3600) });
      prev = statusByCode.get(seg.code)!;
      cumulativeHours += seg.hours;
    }
    closedJobRefs.push({ jobId: jid, clientId: clientId.get(cj.clientKey)! });
  }

  await db.update(tenantJobSequences).set({ nextNumber: jobNum + 1 }).where(eq(tenantJobSequences.tenantId, tenantId));

  // ── Stage 3e.3 — billing (attach to closed jobs round-robin) ──
  let bi = 0;
  for (const inv of VENDOR_INVOICES) {
    const ref = closedJobRefs[bi % closedJobRefs.length]; bi++;
    await db.insert(vendorInvoices).values({
      id: uuidv7(), tenantId, jobId: ref.jobId, vendorId: vendorList[bi % vendorList.length],
      status: inv.status, paymentStatus: inv.paymentStatus, total: inv.total, createdByUserId: adminId,
    });
  }
  bi = 0;
  for (const inv of CLIENT_INVOICES) {
    const ref = closedJobRefs[bi % closedJobRefs.length]; bi++;
    await db.insert(clientInvoices).values({
      id: uuidv7(), tenantId, jobId: ref.jobId, clientId: ref.clientId,
      status: inv.status, paymentStatus: inv.paymentStatus, total: inv.total, createdByUserId: adminId,
    });
  }

  console.log(`\n[seed9d] DONE — tenant ${tenantId}: ${OPEN_JOBS.length} open + ${CLOSED_JOBS.length} closed jobs (jobNumber 1..${jobNum}), ${VENDOR_INVOICES.length} vendor + ${CLIENT_INVOICES.length} client invoices.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed9d] FAILED:", e);
  process.exit(1);
});
