/**
 * scripts/check-client-portal.ts
 *
 * Phase 11 (11p) — CLIENT PORTAL ISOLATION HARNESS (phase-blocking).
 *
 * Discharges the full deferred-verification ledger for Phase 11:
 *   SI-11d.1  list + detail-URL isolation (+ note-visibility filter)
 *   SI-11f.1  job-submission write isolation (the central security crux)
 *   SI-11g.1  client-note write isolation
 *   SI-11i.1  proposal-accept write isolation
 *   11d       routing predicate smoke (isClientUser — the requireClient gate)
 *
 * Phase 11 does NOT tag/push/merge until this harness is GREEN. A failed isolation
 * assertion is a security defect: fix the code, never weaken the assertion.
 *
 * Co-versioning contract (mirrors check-vendor-predicates.ts):
 *   src/server/role-predicates.ts (isClientUser)
 *   src/server/client-scope.ts (getClientScope)
 *   src/server/client/* (readers + write wrappers)
 *   scripts/seed-sandbox-phase9-fixture.ts (client fixture block)
 *   scripts/check-client-portal.ts (this harness)
 * change together in one commit.
 *
 * SEED-DEPENDENT + DESTRUCTIVE (pattern 10): requires the Phase-9 sandbox seed
 * (which now seeds SEED_CLIENT_USER + client_users + 2 sent proposals + client
 * notes). Re-run the seed before each run — this harness writes a job, a note, and
 * accepts a proposal in the sandbox (one-shot post-seed).
 *
 * ROUTING SMOKE: full HTTP redirect (requireClient → /client-no-access) needs a
 * request context and stays deferred; the isClientUser predicate + the empty-scope
 * and out-of-scope reader denials below ARE the discharge of the routing guard's logic.
 *
 * Run: npm run db:check:client-portal   (after the seed; one shot)
 */

// -------- Sandbox guard + env swap (BEFORE any DB-touching import) --------
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[check-client-portal] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(
  /\/pm(\?|$)/,
  "/pm_sandbox$1",
);
if (sandboxUrl === originalUrl && !originalUrl.includes("_sandbox")) {
  console.error(
    "[check-client-portal] could not derive sandbox URL from DATABASE_URL — refusing to run against non-sandbox DB",
  );
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;

// -------- Pure import (no DB) --------
import { isClientUser } from "@/server/role-predicates";

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

// -------- Pure: isClientUser (11d routing predicate) --------
function checkIsClientUser() {
  console.log("\n[P] isClientUser predicate (routing-gate smoke)");
  check(
    "P: isClientUser(client_user) === true",
    isClientUser({ roleKeys: ["client_user"], isSuperAdmin: false }) === true,
  );
  check(
    "P: isClientUser(operator) === false",
    isClientUser({ roleKeys: ["operator"], isSuperAdmin: false }) === false,
  );
  check(
    "P: isClientUser(empty roles) === false",
    isClientUser({ roleKeys: [], isSuperAdmin: false }) === false,
  );
  check(
    "P: isClientUser(super_admin) === true",
    isClientUser({ roleKeys: [], isSuperAdmin: true }) === true,
  );
}

async function main() {
  checkIsClientUser();

  // -------- Dynamic imports (post-env-swap; server-only modules) --------
  const VF = await import("./seed-sandbox-phase9-fixture");
  const { db } = await import("@/server/db");
  const {
    tenants, users, clients, clientLocations, jobs, jobNotes, jobStatuses,
    clientInvoices, proposals, proposalApprovals,
  } = await import("@/server/schema");
  const { and, eq, inArray } = await import("drizzle-orm");

  const { getClientScope } = await import("@/server/client-scope");
  const { listClientJobs } = await import("@/server/client/list-client-jobs");
  const { getClientJobDetail } = await import("@/server/client/get-client-job-detail");
  const { listClientJobNotes } = await import("@/server/client/list-client-job-notes");
  const { createClientJob } = await import("@/server/client/create-client-job");
  const { createClientNote } = await import("@/server/client/create-client-note");
  const { acceptClientProposal } = await import("@/server/client/accept-client-proposal");
  const { listClientInvoicesForClientScope } = await import("@/server/client/list-client-invoices");
  const { listClientJobProposals } = await import("@/server/client/list-client-job-proposals");

  // -------- Resolve identities (fixture holds no ids) --------
  console.log("\n[resolve] tenant / client user / clients / jobs / proposals");
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, VF.SEED_TENANT.slug));
  check("resolve: SEED_TENANT exists (seed has run)", !!tenant);
  if (!tenant) return finish();
  const tenantId = tenant.id;

  const [clientUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, VF.SEED_CLIENT_USER.email));
  check("resolve: SEED_CLIENT_USER exists (seed has run)", !!clientUser);
  if (!clientUser) return finish();
  const clientUserId = clientUser.id;

  const [acme] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tenantId), eq(clients.name, VF.boundClientName())));
  const [globex] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tenantId), eq(clients.name, VF.outOfScopeClientName())));
  check("resolve: in-scope (acme) client exists", !!acme);
  check("resolve: out-of-scope (globex) client exists", !!globex);
  if (!acme || !globex) return finish();
  const acmeId = acme.id;
  const globexId = globex.id;

  const [acmeLoc] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, acmeId))).limit(1);
  const [globexLoc] = await db.select({ id: clientLocations.id }).from(clientLocations).where(and(eq(clientLocations.tenantId, tenantId), eq(clientLocations.clientId, globexId))).limit(1);
  check("resolve: acme location exists", !!acmeLoc);
  check("resolve: globex location exists", !!globexLoc);
  if (!acmeLoc || !globexLoc) return finish();

  const [inProp] = await db.select({ id: proposals.id, jobId: proposals.jobId }).from(proposals).where(and(eq(proposals.tenantId, tenantId), eq(proposals.title, VF.CLIENT_PROPOSAL_FIXTURE.inScopeTitle)));
  const [outProp] = await db.select({ id: proposals.id, jobId: proposals.jobId }).from(proposals).where(and(eq(proposals.tenantId, tenantId), eq(proposals.title, VF.CLIENT_PROPOSAL_FIXTURE.outOfScopeTitle)));
  check("resolve: in-scope sent proposal exists", !!inProp);
  check("resolve: out-of-scope sent proposal exists", !!outProp);
  if (!inProp || !outProp) return finish();
  const inScopeJobId = inProp.jobId;   // acme job (n1)
  const outScopeJobId = outProp.jobId; // globex job (n3)

  const [newStatus] = await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "NEW"));
  check("resolve: NEW job status exists", !!newStatus);
  if (!newStatus) return finish();
  const newStatusId = newStatus.id;

  // -------- Scope resolution (the real getClientScope) --------
  console.log("\n[scope] getClientScope");
  const scopeA = await getClientScope(clientUserId, tenantId);
  check("scope: getClientScope size === 1", scopeA.size === VF.EXPECTED_CLIENT_SCOPE_SIZE);
  check("scope: getClientScope contains acme", scopeA.has(acmeId));
  check("scope: getClientScope does NOT contain globex", !scopeA.has(globexId));
  check("scope: getClientScope(unknown) === empty", (await getClientScope("nope", "nope")).size === 0);

  // ===== SI-11d.1 — READ isolation (list + detail-URL + note filter) =====
  console.log("\n[SI-11d.1] read isolation");
  const listed = await listClientJobs(tenantId, scopeA);
  const listedIds = listed.map((r) => r.id);
  const listedJobRows = listedIds.length
    ? await db.select({ id: jobs.id, clientId: jobs.clientId }).from(jobs).where(inArray(jobs.id, listedIds))
    : [];
  check("A: listClientJobs returns ONLY acme jobs", listedJobRows.length > 0 && listedJobRows.every((j) => j.clientId === acmeId));
  check("A: in-scope job present in list", listedIds.includes(inScopeJobId));
  check("A: out-of-scope job ABSENT from list", !listedIds.includes(outScopeJobId));
  check("B: listClientJobs(emptyScope) === []", (await listClientJobs(tenantId, new Set<string>())).length === 0);
  check("C: getClientJobDetail(in-scope) !== null", (await getClientJobDetail(tenantId, inScopeJobId, scopeA)) !== null);
  check("D: getClientJobDetail(out-of-scope) === null (direct-URL isolation)", (await getClientJobDetail(tenantId, outScopeJobId, scopeA)) === null);
  check("E: listClientJobNotes(out-of-scope) === []", (await listClientJobNotes(tenantId, outScopeJobId, scopeA)).length === 0);

  const inNotes = await listClientJobNotes(tenantId, inScopeJobId, scopeA);
  const gotMarkers = inNotes.map((n) => n.body).filter((b) => b.startsWith("[11p-fixture]")).sort();
  const wantMarkers = [...VF.expectedClientVisibleNoteMarkers()].sort();
  check("F: in-scope notes = exactly the client-visible markers", JSON.stringify(gotMarkers) === JSON.stringify(wantMarkers));
  check("F: excludes internal_only note", !inNotes.some((n) => n.body.includes("internal-only")));
  check("F: excludes vendor_visible note", !inNotes.some((n) => n.body.includes("vendor-visible")));

  // ===== OQ-6 shape + invoice filter (before M consumes the sent proposal) =====
  console.log("\n[OQ-6 / invoice filter]");
  const invs = await listClientInvoicesForClientScope(tenantId, scopeA);
  check("N: invoices non-empty for acme", invs.length > 0);
  if (invs.length) {
    const k = Object.keys(invs[0]);
    check("N: invoice row exposes total", k.includes("total"));
    check("N: invoice row HIDES subtotal (OQ-6)", !k.includes("subtotal"));
    check("N: invoice row HIDES markupTotal (OQ-6)", !k.includes("markupTotal"));
  }
  const propsList = await listClientJobProposals(tenantId, inScopeJobId, scopeA);
  check("N: in-scope sent proposal present in reader", propsList.some((p) => p.title === VF.CLIENT_PROPOSAL_FIXTURE.inScopeTitle));
  if (propsList.length) {
    const pk = Object.keys(propsList[0]);
    check("N: proposal row exposes total", pk.includes("total"));
    check("N: proposal row HIDES subtotal (OQ-6)", !pk.includes("subtotal"));
    check("N: proposal row HIDES markupTotal (OQ-6)", !pk.includes("markupTotal"));
  }

  const acmeSent = await db.select({ id: clientInvoices.id }).from(clientInvoices).where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.clientId, acmeId), eq(clientInvoices.status, "sent")));
  const acmeSentIds = new Set(acmeSent.map((r) => r.id));
  const gotInvIds = new Set(invs.map((i) => i.id));
  check("O: returns EXACTLY acme sent invoices", gotInvIds.size === acmeSentIds.size && [...gotInvIds].every((id) => acmeSentIds.has(id)));
  check("O: all returned invoices status='sent'", invs.every((i) => i.status === "sent"));
  const globexInvIds = new Set((await db.select({ id: clientInvoices.id }).from(clientInvoices).where(and(eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.clientId, globexId)))).map((r) => r.id));
  check("O: no out-of-scope (globex) invoice leaks", !invs.some((i) => globexInvIds.has(i.id)));

  // ===== SI-11f.1 — WRITE isolation (job submission; the central crux) =====
  console.log("\n[SI-11f.1] job-submission write isolation");
  const countJobs = async (clientId: string) =>
    (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.tenantId, tenantId), eq(jobs.clientId, clientId)))).length;

  const globexBefore = await countJobs(globexId);
  let gErr = "";
  try {
    await createClientJob({ tenantId, clientId: globexId, clientScope: scopeA, clientLocationId: acmeLoc.id, problemDescription: "[11p-harness] forged out-of-scope job", createdByUserId: clientUserId });
  } catch (e) { gErr = e instanceof Error ? e.message : String(e); }
  check("G: forged out-of-scope clientId → CLIENT_SCOPE_MISMATCH", gErr === "CLIENT_SCOPE_MISMATCH");
  check("G: zero jobs written for out-of-scope client", (await countJobs(globexId)) === globexBefore);

  const acmeBefore = await countJobs(acmeId);
  let hErr = "";
  try {
    await createClientJob({ tenantId, clientId: acmeId, clientScope: scopeA, clientLocationId: globexLoc.id, problemDescription: "[11p-harness] mismatched location", createdByUserId: clientUserId });
  } catch (e) { hErr = e instanceof Error ? e.message : String(e); }
  check("H: location under another client → throws (scope/location mismatch)", hErr === "CLIENT_SCOPE_MISMATCH" || hErr === "LOCATION_CLIENT_MISMATCH");
  check("H: zero jobs written on location mismatch", (await countJobs(acmeId)) === acmeBefore);

  const job = await createClientJob({ tenantId, clientId: acmeId, clientScope: scopeA, clientLocationId: acmeLoc.id, problemDescription: "[11p-harness] valid client job", createdByUserId: clientUserId });
  check("I: valid write — source_type='internal_client_portal'", job.sourceType === "internal_client_portal");
  check("I: valid write — status NEW", job.currentStatusId === newStatusId);
  check("I: valid write — client_id pinned to acme", job.clientId === acmeId);
  check("I: valid write — primaryTradeId NULL", job.primaryTradeId === null);
  check("I: valid write — not_to_exceed_amount NULL", job.notToExceedAmount === null);
  check("I: valid write — created_by = seed client user", job.createdByUserId === clientUserId);

  // ===== SI-11g.1 — NOTE-write isolation =====
  console.log("\n[SI-11g.1] note-write isolation");
  const countNotes = async (jobId: string) =>
    (await db.select({ id: jobNotes.id }).from(jobNotes).where(and(eq(jobNotes.tenantId, tenantId), eq(jobNotes.jobId, jobId)))).length;

  const outNotesBefore = await countNotes(outScopeJobId);
  let jErr = "";
  try {
    await createClientNote({ tenantId, jobId: outScopeJobId, clientScope: scopeA, actorUserId: clientUserId, body: "[11p-harness] forged note" });
  } catch (e) { jErr = e instanceof Error ? e.message : String(e); }
  check("J: out-of-scope note write → CLIENT_SCOPE_MISMATCH", jErr === "CLIENT_SCOPE_MISMATCH");
  check("J: zero notes written on out-of-scope job", (await countNotes(outScopeJobId)) === outNotesBefore);

  const noteRow = await createClientNote({ tenantId, jobId: inScopeJobId, clientScope: scopeA, actorUserId: clientUserId, body: "[11p-harness] client update" });
  const [writtenNote] = await db.select({ origin: jobNotes.origin, visibility: jobNotes.visibility }).from(jobNotes).where(eq(jobNotes.id, noteRow.id));
  check("K: in-scope note written — origin='client'", writtenNote?.origin === "client");
  check("K: in-scope note written — visibility='client_visible'", writtenNote?.visibility === "client_visible");
  const afterNotes = await listClientJobNotes(tenantId, inScopeJobId, scopeA);
  check("K: new client note appears in listClientJobNotes", afterNotes.some((n) => n.body === "[11p-harness] client update"));

  // ===== SI-11i.1 — PROPOSAL-accept isolation =====
  console.log("\n[SI-11i.1] proposal-accept isolation");
  let lErr = "";
  try {
    await acceptClientProposal({ tenantId, proposalId: outProp.id, clientScope: scopeA, actorUserId: clientUserId });
  } catch (e) { lErr = e instanceof Error ? e.message : String(e); }
  check("L: out-of-scope proposal accept → CLIENT_SCOPE_MISMATCH", lErr === "CLIENT_SCOPE_MISMATCH");
  const [outAfter] = await db.select({ status: proposals.status }).from(proposals).where(eq(proposals.id, outProp.id));
  check("L: out-of-scope proposal STILL 'sent' (zero state change)", outAfter?.status === "sent");

  await acceptClientProposal({ tenantId, proposalId: inProp.id, clientScope: scopeA, actorUserId: clientUserId });
  const [inAfter] = await db.select({ status: proposals.status }).from(proposals).where(eq(proposals.id, inProp.id));
  check("M: in-scope proposal now 'accepted'", inAfter?.status === "accepted");
  const approvals = await db.select({ id: proposalApprovals.id }).from(proposalApprovals).where(and(eq(proposalApprovals.tenantId, tenantId), eq(proposalApprovals.proposalId, inProp.id)));
  check("M: proposal_approvals row written", approvals.length >= 1);

  return finish();
}

function finish() {
  console.log("");
  console.log(`[check-client-portal] passed: ${passed}`);
  console.log(`[check-client-portal] failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f}`);
    console.log("\n[check-client-portal] ISOLATION LEDGER RED ✗ — PHASE BLOCKED");
    process.exit(1);
  }
  console.log("[check-client-portal] ISOLATION LEDGER GREEN ✓ (SI-11d.1 / SI-11f.1 / SI-11g.1 / SI-11i.1 / 11d routing)");
  process.exit(0);
}

void main();
