export {};
/**
 * CF-20.1 phase-blocking harness — operator job-photo reader.
 * Sandbox-only. Self-seeds, teardown children-first under FK_CHECKS=0, 0 leftover.
 * Asserts the no-existence-leak discriminated result (the security property),
 * list scoping, and the capture-provider url path.
 *
 * Run: STORAGE_CAPTURE=1 DATABASE_URL=<sandbox> pnpm tsx scripts/harness/cf-20-1-job-photos.ts
 */

// -------- Sandbox guard + capture flag (BEFORE any DB/storage import) --------
// Lifted verbatim from scripts/check-phase-20.ts:23-37 — the proven sandbox convention.
// .env.local's DATABASE_URL points at the live `jonnyrosero_pm`; we swap to the separate
// `pm_sandbox` DB here, before @/server/db reads the env var at import.
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[cf-20-1] DATABASE_URL not set");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
if (!sandboxUrl.includes("pm_sandbox")) {
  console.error("[cf-20-1] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
process.env.STORAGE_CAPTURE = "1"; // force CaptureStorageProvider — no real R2, no network.
delete process.env.R2_ACCESS_KEY_ID; // belt-and-suspenders: never construct R2Provider.
console.log(`[cf-20-1] sandbox target confirmed: ${sandboxUrl.replace(/.*@/, "...@")}`);

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL- ${name}`, detail !== undefined ? detail : "");
  }
}

async function main() {
  const { db } = await import("@/server/db");
  const { jobAttachments } = await import("@/server/schema/job-details");
  const { tenants, clients, clientLocations, jobs, jobStatuses } = await import("@/server/schema");
  const { listJobPhotos, getJobPhotoUrl } = await import("@/server/job-attachments");
  const { and, eq, inArray } = await import("drizzle-orm");

  // --- minimal seed: two tenants, each with a job; photos under tenant A's job ---
  const tA = "cf201-tenantA";
  const tB = "cf201-tenantB";
  const jobA = "cf201-jobA";
  const jobB = "cf201-jobB"; // tenant B's job — same id-space, different scope
  const pStored = "cf201-photo-stored";     // tenant A, jobA, has storageKey
  const pTitleOnly = "cf201-photo-titleonly"; // tenant A, jobA, storageKey NULL
  const pArchived = "cf201-photo-archived";   // tenant A, jobA, archived (excluded)
  const pOlder = "cf201-photo-older";         // tenant A, jobA, older (order check)
  const pDoc = "cf201-doc-notphoto";          // tenant A, jobA, attachmentType document (excluded)
  const pTenantB = "cf201-photo-tenantB";     // tenant B, jobB (cross-tenant)

  // Stored photo's object key — referenced by BOTH the seed insert and the capture put()
  // (single source so the two can't drift; the capture provider only signs keys put() this process).
  const storedKey = "tenant/A/job/A/attachment/stored.jpg";

  const allIds = [pStored, pTitleOnly, pArchived, pOlder, pDoc, pTenantB];

  async function teardown() {
    // children-first ordered deletes (Neon-safe; pg enforces the attachment->job->... FKs).
    await db.delete(jobAttachments).where(inArray(jobAttachments.id, allIds));
    await db.delete(jobs).where(inArray(jobs.id, [jobA, jobB]));
    await db.delete(clientLocations).where(inArray(clientLocations.tenantId, [tA, tB]));
    await db.delete(clients).where(inArray(clients.tenantId, [tA, tB]));
    await db.delete(tenants).where(inArray(tenants.id, [tA, tB]));
  }

  await teardown(); // pre-clean any prior run

  // Seed the real parent chain so the attachment FKs (tenant_id, job_id) resolve — pg enforces
  // them (MySQL did not). Each tenant gets one client + location + job under a global job status.
  const [anyStatus] = await db.select({ id: jobStatuses.id }).from(jobStatuses).limit(1);
  if (!anyStatus) { console.error("HARNESS SETUP: no global job_statuses — run the base seed first"); process.exit(2); }
  let jn = 9000;
  for (const [t, j] of [[tA, jobA], [tB, jobB]] as const) {
    await db.insert(tenants).values({ id: t, slug: `jp-${t}`, name: `JobPhotos ${t}` });
    await db.insert(clients).values({ id: `${t}-client`, tenantId: t, name: "JP Client" });
    await db.insert(clientLocations).values({ id: `${t}-loc`, tenantId: t, clientId: `${t}-client`, name: "Loc", addressLine1: "1 St", city: "X", stateProvince: "NV", postalCode: "89101" });
    await db.insert(jobs).values({ id: j, tenantId: t, jobNumber: ++jn, clientId: `${t}-client`, clientLocationId: `${t}-loc`, currentStatusId: anyStatus.id, problemDescription: "job-photos harness" });
  }

  const base = {
    attachmentType: "photo" as const,
    storageProvider: "r2",
    checksum: null,
    fileMimeType: "image/jpeg",
    fileSizeBytes: 12345,
    visibility: "internal_only" as const,
    status: "active" as const,
  };

  const now = Date.now();
  // Attachments reference the real tenant/job rows seeded above (pg enforces the FKs; the readers
  // under test still only SELECT from job_attachments — the parents just satisfy the constraints).
  await db.insert(jobAttachments).values([
    { id: pStored,    tenantId: tA, jobId: jobA, title: "after",  storageKey: storedKey, createdAt: new Date(now),          ...base },
    { id: pOlder,     tenantId: tA, jobId: jobA, title: "before", storageKey: "tenant/A/job/A/attachment/older.jpg",  createdAt: new Date(now - 60000),  ...base },
    { id: pTitleOnly, tenantId: tA, jobId: jobA, title: "titleonly", storageKey: null,                                createdAt: new Date(now - 1000),   ...base },
    { id: pArchived,  tenantId: tA, jobId: jobA, title: "arch",   storageKey: "tenant/A/job/A/attachment/arch.jpg",   createdAt: new Date(now),          ...base, status: "archived" as const },
    { id: pDoc,       tenantId: tA, jobId: jobA, title: "a-doc",  storageKey: "tenant/A/job/A/attachment/doc.pdf",    createdAt: new Date(now),          ...base, attachmentType: "document" as const, fileMimeType: "application/pdf" },
    { id: pTenantB,   tenantId: tB, jobId: jobB, title: "bphoto", storageKey: "tenant/B/job/B/attachment/b.jpg",      createdAt: new Date(now),          ...base },
  ] as any);

  // Put the stored photo's bytes into the capture store so getSignedUrl can sign the key.
  // The capture provider signs ONLY keys put() this process (in-memory Map) — without this,
  // a real-storageKey row correctly degrades to 'unavailable'. put() shape bound to PutRequest.
  const { getStorageProvider } = await import("@/lib/integrations/storage");
  await getStorageProvider().put({
    key: storedKey,
    bytes: Buffer.from("fake-jpeg"),
    contentType: "image/jpeg",
  });

  // ===== listJobPhotos scoping =====
  const listA = await listJobPhotos(tA, jobA);
  const listIds = listA.map((r) => r.id);
  check("list: returns only active photos for (tenantA, jobA)",
    listIds.length === 3 && listIds.includes(pStored) && listIds.includes(pOlder) && listIds.includes(pTitleOnly),
    listIds);
  check("list: excludes archived", !listIds.includes(pArchived));
  check("list: excludes non-photo (document)", !listIds.includes(pDoc));
  check("list: excludes cross-tenant photo", !listIds.includes(pTenantB));
  check("list: newest-first order (stored before older)",
    listIds.indexOf(pStored) < listIds.indexOf(pOlder), listIds);
  const storedRow = listA.find((r) => r.id === pStored);
  const titleOnlyRow = listA.find((r) => r.id === pTitleOnly);
  check("list: hasFile true when storageKey present", storedRow?.hasFile === true);
  check("list: hasFile false when storageKey null", titleOnlyRow?.hasFile === false);

  // ===== getJobPhotoUrl — the no-leak discriminated result (security property) =====
  const urlStored = await getJobPhotoUrl({ tenantId: tA, jobId: jobA, attachmentId: pStored });
  check("url: stored photo under capture provider -> kind 'url' with capture:// URL",
    urlStored.kind === "url" && /^capture:\/\//.test((urlStored as any).url), urlStored);

  const urlTitleOnly = await getJobPhotoUrl({ tenantId: tA, jobId: jobA, attachmentId: pTitleOnly });
  check("url: title-only row (no storageKey) -> placeholder", urlTitleOnly.kind === "placeholder", urlTitleOnly);

  const urlArchived = await getJobPhotoUrl({ tenantId: tA, jobId: jobA, attachmentId: pArchived });
  check("url: archived row -> forbidden (out of scope)", urlArchived.kind === "forbidden", urlArchived);

  const urlDoc = await getJobPhotoUrl({ tenantId: tA, jobId: jobA, attachmentId: pDoc });
  check("url: non-photo attachment -> forbidden (attachmentType filter holds)", urlDoc.kind === "forbidden", urlDoc);

  const urlNonexistent = await getJobPhotoUrl({ tenantId: tA, jobId: jobA, attachmentId: "does-not-exist" });
  check("url: nonexistent id -> forbidden", urlNonexistent.kind === "forbidden", urlNonexistent);

  // the two leak probes — identical 'forbidden' to a nonexistent id, no existence signal
  const urlCrossTenant = await getJobPhotoUrl({ tenantId: tB, jobId: jobA, attachmentId: pStored });
  check("url: NO LEAK — real photo id under wrong tenant -> forbidden (not url/placeholder)",
    urlCrossTenant.kind === "forbidden", urlCrossTenant);

  const urlCrossJob = await getJobPhotoUrl({ tenantId: tA, jobId: jobB, attachmentId: pStored });
  check("url: NO LEAK — real photo id under wrong job -> forbidden (not url/placeholder)",
    urlCrossJob.kind === "forbidden", urlCrossJob);

  // ===== teardown + leftover assertion =====
  await teardown();
  const { sql } = await import("drizzle-orm");
  const leftover = await db.select({ id: jobAttachments.id }).from(jobAttachments)
    .where(inArray(jobAttachments.id, allIds));
  check("teardown: 0 leftover seed rows", leftover.length === 0, leftover);

  console.log("");
  if (failures > 0) {
    console.error(`HARNESS RED — ${failures} failure(s).`);
    process.exit(1);
  }
  console.log("HARNESS GREEN — all checks passed.");
  process.exit(0);
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
