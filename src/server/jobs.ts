import "server-only";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  auditLogs,
  clientLocations,
  clients,
  dispatchAssignmentStatuses,
  jobEvents,
  jobPriorityHistory,
  jobStatusHistory,
  jobStatuses,
  jobTradeHistory,
  jobVendorAssignments,
  jobs,
  priorities,
  tenantJobSequences,
  trades,
} from "@/server/schema";
import { getClient } from "@/server/clients";
import { getLocation } from "@/server/client-locations";
import { getJobStatusByCode, getPriority } from "@/server/job-reference";
import { getTrade } from "@/server/trades";
// Phase 8 (8c.4): createJob is the SOLE writer of jobs.not_to_exceed_amount — it resolves
// the NTE from the client NTE config (Surface 23) and snapshots it. First Phase-4 → Phase-8
// import; one-way (jobs → billing); billing modules never import jobs.ts (acyclic). (9e)
import { resolveClientNteRule } from "@/server/billing/nte";
import { emitJobBillingEvent } from "@/server/billing/events";

export type JobRow = typeof jobs.$inferSelect;
// 8-value union derived from the schema enum (no drift).
export type JobSourceType = NonNullable<
  (typeof jobs.$inferInsert)["sourceType"]
>;

// Every new job starts at the global "NEW" status — a convention enforced here,
// in one place, so callers never pass an initial status (D-4.x).
const INITIAL_STATUS_CODE = "NEW";

export type JobListItem = {
  id: string;
  jobNumber: number;
  clientName: string;
  locationName: string;
  statusName: string;
  priorityName: string | null;
  createdAt: Date;
};

/**
 * Non-archived jobs for a tenant, newest first. Joined to the display labels the
 * list page renders (client / location / status names, priority name nullable
 * since priority_id is nullable). No pagination yet (carry-forward).
 *
 * (9e) Optional `filters` narrow by current status and/or priority — additive on
 * the existing `is_archived=false` base (the open-population definition, 9c §9),
 * so a status card's count and the `/jobs?status=` filtered view stay consistent.
 * Callers pass already-validated ids (see resolveJobsFilters).
 */
export async function listJobs(
  tenantId: string,
  filters?: { statusId?: string; priorityId?: string },
): Promise<JobListItem[]> {
  const conditions = [eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false)];
  if (filters?.statusId) conditions.push(eq(jobs.currentStatusId, filters.statusId));
  if (filters?.priorityId) conditions.push(eq(jobs.priorityId, filters.priorityId));

  return db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      locationName: clientLocations.name,
      statusName: jobStatuses.name,
      priorityName: priorities.name,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt));
}

/**
 * (9e) Validate optional `/jobs` URL filter ids against the tenant's vocabulary, dropping any that
 * don't resolve — graceful fallthrough: a stale/foreign id yields an unfiltered dimension, never a
 * 404 (manifest §6). Status is global (`job_statuses`); priority is tenant-scoped (`priorities`).
 * Dashboard-generated links are always valid; this guards hand-edited / stale URLs.
 */
export async function resolveJobsFilters(
  tenantId: string,
  params: { status?: string; priority?: string },
): Promise<{ statusId?: string; priorityId?: string }> {
  const out: { statusId?: string; priorityId?: string } = {};
  if (params.status) {
    const rows = await db
      .select({ id: jobStatuses.id })
      .from(jobStatuses)
      .where(eq(jobStatuses.id, params.status))
      .limit(1);
    if (rows.length) out.statusId = rows[0].id;
  }
  if (params.priority) {
    const rows = await db
      .select({ id: priorities.id })
      .from(priorities)
      .where(and(eq(priorities.tenantId, tenantId), eq(priorities.id, params.priority)))
      .limit(1);
    if (rows.length) out.priorityId = rows[0].id;
  }
  return out;
}

/**
 * One job by id, scoped to the tenant. Lean — just the jobs row (the detail page
 * composes related data via separate calls). Null if missing/cross-tenant.
 */
export async function getJob(tenantId: string, id: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type JobDetail = {
  id: string;
  jobNumber: number;
  clientId: string;
  clientName: string;
  clientLocationId: string;
  locationName: string;
  primaryTradeId: string | null;
  tradeName: string | null;
  priorityId: string | null;
  priorityName: string | null;
  currentStatusId: string;
  statusName: string;
  sourceType: JobSourceType;
  sourceExternalId: string | null;
  problemDescription: string;
  scopeOfWork: string | null;
  approvedScopeOfWork: string | null;
  notToExceedAmount: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One job with its display labels resolved (client / location / trade / priority
 * / status names) in a single join. Tenant-scoped — null if missing or in a
 * different tenant (same guard as getJob; the detail page calls notFound() on
 * null). Row-level equivalent of listJobs' join. getJob stays lean for guards
 * and the createJob reload; this is the detail page's purpose-built read.
 */
export async function getJobDetail(
  tenantId: string,
  id: string,
): Promise<JobDetail | null> {
  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      clientId: jobs.clientId,
      clientName: clients.name,
      clientLocationId: jobs.clientLocationId,
      locationName: clientLocations.name,
      primaryTradeId: jobs.primaryTradeId,
      tradeName: trades.name,
      priorityId: jobs.priorityId,
      priorityName: priorities.name,
      currentStatusId: jobs.currentStatusId,
      statusName: jobStatuses.name,
      sourceType: jobs.sourceType,
      sourceExternalId: jobs.sourceExternalId,
      problemDescription: jobs.problemDescription,
      scopeOfWork: jobs.scopeOfWork,
      approvedScopeOfWork: jobs.approvedScopeOfWork,
      notToExceedAmount: jobs.notToExceedAmount,
      scheduledStartAt: jobs.scheduledStartAt,
      scheduledEndAt: jobs.scheduledEndAt,
      dueAt: jobs.dueAt,
      completedAt: jobs.completedAt,
      closedAt: jobs.closedAt,
      isArchived: jobs.isArchived,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .leftJoin(trades, eq(jobs.primaryTradeId, trades.id))
    .leftJoin(priorities, eq(jobs.priorityId, priorities.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateJobInput = {
  tenantId: string;
  clientId: string;
  clientLocationId: string;
  primaryTradeId?: string | null;
  priorityId?: string | null;
  sourceType?: JobSourceType;
  sourceExternalId?: string | null;
  problemDescription: string;
  scopeOfWork?: string | null;
  // Operator-entered NTE (the override/manual value), canonical "d.dd" from the action layer
  // (9b). Optional: absent ⇒ the resolver's value snapshots (Case A) or NULL (Case E). (8c.4)
  notToExceedAmount?: string | null;
  createdByUserId: string;
};

/**
 * Create a job. Parent-in-tenant guards run first (read-only); the 7-step
 * mutation then runs in ONE transaction (D-4.5/D-4.6): ensure+lock the per-tenant
 * counter, insert the job with the allocated job_number and the initial NEW
 * status, bump the counter, write the initial status-history row, the job.created
 * timeline event, and the audit_logs row (the audit insert is INSIDE the txn —
 * atomicity over resilience for multi-row writes; D-4.x).
 *
 * Throws: CLIENT_NOT_FOUND, LOCATION_NOT_FOUND, LOCATION_CLIENT_MISMATCH,
 * TRADE_NOT_FOUND (if trade given), PRIORITY_NOT_FOUND (if priority given),
 * STATUS_NOT_FOUND (defensive — NEW status missing; shouldn't fire if seeded).
 */
export async function createJob(input: CreateJobInput): Promise<JobRow> {
  // --- parent-in-tenant guards (read-only; no need to be inside the txn) ---
  const client = await getClient(input.tenantId, input.clientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  const location = await getLocation(input.tenantId, input.clientLocationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");
  if (location.clientId !== input.clientId) throw new Error("LOCATION_CLIENT_MISMATCH");

  if (input.priorityId) {
    const priority = await getPriority(input.tenantId, input.priorityId);
    if (!priority) throw new Error("PRIORITY_NOT_FOUND");
  }

  if (input.primaryTradeId) {
    const trade = await getTrade(input.primaryTradeId);
    if (!trade) throw new Error("TRADE_NOT_FOUND");
  }

  const initialStatus = await getJobStatusByCode(INITIAL_STATUS_CODE);
  if (!initialStatus) throw new Error("STATUS_NOT_FOUND");

  const jobId = uuidv7();
  const sourceType: JobSourceType = input.sourceType ?? "manual";

  // --- NTE resolution + override decision (Surface 23 / 8c.4) — pre-txn read ---
  // resolveClientNteRule needs the full key; skip if trade OR priority is absent (9f).
  const operatorNte = input.notToExceedAmount ?? null;
  const resolvedNte =
    input.primaryTradeId && input.priorityId
      ? await resolveClientNteRule({
          tenantId: input.tenantId,
          clientId: input.clientId,
          tradeId: input.primaryTradeId,
          priorityId: input.priorityId,
          clientLocationId: input.clientLocationId,
        })
      : null;
  // 5-case matrix (9c). Comparison is plain === — both are canonical "d.dd" (operatorNte is
  // action-canonicalized at the boundary, 9b; resolvedNte.amount is a DB decimal(12,2)). No
  // money arithmetic in jobs.ts (9a — no decimal lib here).
  let finalNte: string | null;
  let isOverride = false;
  if (operatorNte !== null) {
    finalNte = operatorNte; // Case B / C / D
    if (resolvedNte !== null && operatorNte !== resolvedNte.amount) isOverride = true; // Case C
  } else {
    finalNte = resolvedNte !== null ? resolvedNte.amount : null; // Case A / Case E
  }

  await db.transaction(async (tx) => {
    // 1. Ensure the tenant's sequence row exists (idempotent, race-safe).
    await tx.execute(sql`
      INSERT INTO tenant_job_sequences (tenant_id, next_number)
      VALUES (${input.tenantId}, 1)
      ON DUPLICATE KEY UPDATE next_number = next_number
    `);

    // 2. Lock the sequence row and read the number to assign.
    const seqRows = await tx
      .select({ nextNumber: tenantJobSequences.nextNumber })
      .from(tenantJobSequences)
      .where(eq(tenantJobSequences.tenantId, input.tenantId))
      .for("update");
    const n = seqRows[0].nextNumber;

    // 3. Insert the job with the allocated number and the initial status.
    await tx.insert(jobs).values({
      id: jobId,
      tenantId: input.tenantId,
      jobNumber: n,
      clientId: input.clientId,
      clientLocationId: input.clientLocationId,
      primaryTradeId: input.primaryTradeId ?? null,
      priorityId: input.priorityId ?? null,
      currentStatusId: initialStatus.id,
      sourceType,
      sourceExternalId: input.sourceExternalId ?? null,
      problemDescription: input.problemDescription,
      scopeOfWork: input.scopeOfWork ?? null,
      notToExceedAmount: finalNte, // 8c.4: rule-resolved snapshot or operator value (matrix 9c)
      createdByUserId: input.createdByUserId,
    });

    // 4. Bump the counter.
    await tx
      .update(tenantJobSequences)
      .set({ nextNumber: n + 1 })
      .where(eq(tenantJobSequences.tenantId, input.tenantId));

    // 5. Initial status-history row (from null → NEW; changed_by = creator, D-4.x).
    await tx.insert(jobStatusHistory).values({
      tenantId: input.tenantId,
      jobId,
      fromStatusId: null,
      toStatusId: initialStatus.id,
      changedByUserId: input.createdByUserId,
    });

    // 6. Timeline event.
    await tx.insert(jobEvents).values({
      tenantId: input.tenantId,
      jobId,
      eventType: "job.created",
      actorUserId: input.createdByUserId,
      summary: `Job #${n} created`,
      metadata: { jobNumber: n, sourceType, clientId: input.clientId },
    });

    // 7. Audit row — INSIDE the transaction (atomicity over resilience; D-4.x).
    //    Deliberately a direct tx.insert, NOT writeAuditLog() (which uses the
    //    global db and swallows errors).
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.createdByUserId,
      action: "job.created",
      targetType: "job",
      targetId: jobId,
      metadata: { jobNumber: n, clientId: input.clientId, sourceType },
    });

    // 8. (8c.4) Operator overrode the rule-resolved NTE (Case C only) — financial audit,
    //    INSIDE the txn so the override event commits atomically with the job + its snapshot.
    //    Job-level event (no record refs); ruleSource (not "source" — jobs.source_type exists).
    if (isOverride && resolvedNte !== null && operatorNte !== null) {
      await emitJobBillingEvent(tx, {
        tenantId: input.tenantId,
        jobId,
        eventType: "nte.overridden",
        actorUserId: input.createdByUserId,
        summary: `Job NTE overridden: ${resolvedNte.amount} (rule) → ${operatorNte}`,
        amount: operatorNte,
        currency: resolvedNte.currency,
        metadata: {
          ruleId: resolvedNte.ruleId,
          ruleSource: resolvedNte.source,
          ruleAmount: resolvedNte.amount,
          overrideAmount: operatorNte,
          level: "job",
        },
      });
    }
  });

  const row = await getJob(input.tenantId, jobId);
  if (!row) throw new Error("Job insert succeeded but row could not be reloaded.");
  return row;
}

// ── v2.11.0 batch 1 — post-create job editing (updateJob) ─────────────────────────────
// The SECOND writer of jobs (createJob was the first). Editable fields only — client_id is
// IMMUTABLE (changing a job's client would orphan its proposals/invoices/assignments/NTE rules),
// and generated/approved scope are owned by the scope-generator publish flow (out of scope here).
//
// Mirrors createJob's step-5..8 dual-write EXACTLY: every meaningful change writes the typed
// history row (priority/trade) and/or a job_events row and/or the nte.adjusted billing event, plus
// ONE audit_logs row, ALL inside ONE transaction (D-4.6). A no-op (nothing changed) writes nothing.
//
// DELIBERATE INVARIANT BREAK (8c.4): editing not_to_exceed_amount makes updateJob a second writer of
// that column (createJob was the sole writer). Recorded here, surfaced as nte.adjusted (distinct from
// the create-time nte.overridden). The effective NTE stays computed-on-read (edited base + Σ approved
// COs) — change orders stack on whatever the base now is. The value MUST be canonicalized by the
// caller (canonicalizeNte) — no money lib in this layer (9a).
//
// HARD server guards (not just UI): (1) a new location must belong to the SAME client (client_id
// immutable); (2) a problem_description change is rejected unless source_type is operator/platform-
// authored (a client-submitted request is locked). Trade/location edits are warn-not-block
// post-dispatch — the warning is advisory UI (hasActiveAssignment), NOT enforced here.

// source_types whose problem_description is operator/platform-authored (editable). The rest
// (internal_client_portal / external_client_portal / email_ingestion / forwarded_email / api) carry
// the client's / external requester's words → problem_description is LOCKED.
const OPERATOR_DESCRIPTION_SOURCES: ReadonlySet<JobSourceType> = new Set([
  "manual",
  "preventative_maintenance",
  "snow_event",
]);

export type JobPatch = {
  priorityId?: string | null;
  primaryTradeId?: string | null;
  notToExceedAmount?: string | null; // canonical "d.dd" or null — caller canonicalizes (canonicalizeNte)
  clientLocationId?: string;
  problemDescription?: string;
  scopeOfWork?: string | null;
};

export type UpdateJobInput = {
  tenantId: string;
  jobId: string;
  actorUserId: string;
  patch: JobPatch;
};

/**
 * Edit an existing job's mutable fields in one transaction, dual-writing history/events/audit for
 * every change. No-op when nothing changed. Reloads and returns the job row.
 *
 * Throws: JOB_NOT_FOUND, LOCATION_NOT_FOUND, LOCATION_CLIENT_MISMATCH, PRIORITY_NOT_FOUND,
 * TRADE_NOT_FOUND, PRIORITY_REQUIRED / TRADE_REQUIRED (cannot clear — the typed history's to_*_id is
 * NOT NULL), PROBLEM_DESCRIPTION_REQUIRED, PROBLEM_DESCRIPTION_LOCKED (client/external-sourced).
 */
export async function updateJob(input: UpdateJobInput): Promise<JobRow> {
  const { tenantId, jobId, actorUserId, patch } = input;

  await db.transaction(async (tx) => {
    // Lock + read the current values (compute from→to; no-op unchanged fields).
    const curRows = await tx
      .select({
        clientId: jobs.clientId,
        clientLocationId: jobs.clientLocationId,
        primaryTradeId: jobs.primaryTradeId,
        priorityId: jobs.priorityId,
        notToExceedAmount: jobs.notToExceedAmount,
        problemDescription: jobs.problemDescription,
        scopeOfWork: jobs.scopeOfWork,
        sourceType: jobs.sourceType,
      })
      .from(jobs)
      .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
      .for("update");
    const cur = curRows[0];
    if (!cur) throw new Error("JOB_NOT_FOUND");

    const set: Partial<typeof jobs.$inferInsert> = {};
    const changedFields: string[] = [];

    // priority — typed history + job.priority_changed (to_priority_id is NN → cannot clear).
    if (patch.priorityId !== undefined && patch.priorityId !== cur.priorityId) {
      if (patch.priorityId === null) throw new Error("PRIORITY_REQUIRED");
      const p = await getPriority(tenantId, patch.priorityId);
      if (!p) throw new Error("PRIORITY_NOT_FOUND");
      set.priorityId = patch.priorityId;
      changedFields.push("priorityId");
      await tx.insert(jobPriorityHistory).values({
        tenantId, jobId, fromPriorityId: cur.priorityId, toPriorityId: patch.priorityId, changedByUserId: actorUserId,
      });
      await tx.insert(jobEvents).values({
        tenantId, jobId, eventType: "job.priority_changed", actorUserId,
        summary: "Priority changed", metadata: { from: cur.priorityId, to: patch.priorityId },
      });
    }

    // trade — typed history + job.trade_changed (to_trade_id is NN → cannot clear).
    if (patch.primaryTradeId !== undefined && patch.primaryTradeId !== cur.primaryTradeId) {
      if (patch.primaryTradeId === null) throw new Error("TRADE_REQUIRED");
      const t = await getTrade(patch.primaryTradeId);
      if (!t) throw new Error("TRADE_NOT_FOUND");
      set.primaryTradeId = patch.primaryTradeId;
      changedFields.push("primaryTradeId");
      await tx.insert(jobTradeHistory).values({
        tenantId, jobId, fromTradeId: cur.primaryTradeId, toTradeId: patch.primaryTradeId, changedByUserId: actorUserId,
      });
      await tx.insert(jobEvents).values({
        tenantId, jobId, eventType: "job.trade_changed", actorUserId,
        summary: "Trade changed", metadata: { from: cur.primaryTradeId, to: patch.primaryTradeId },
      });
    }

    // location — same-client guard (client_id immutable); no typed history table → job_events only.
    if (patch.clientLocationId !== undefined && patch.clientLocationId !== cur.clientLocationId) {
      const loc = await getLocation(tenantId, patch.clientLocationId);
      if (!loc) throw new Error("LOCATION_NOT_FOUND");
      if (loc.clientId !== cur.clientId) throw new Error("LOCATION_CLIENT_MISMATCH");
      set.clientLocationId = patch.clientLocationId;
      changedFields.push("clientLocationId");
      await tx.insert(jobEvents).values({
        tenantId, jobId, eventType: "job.location_changed", actorUserId,
        summary: "Location changed", metadata: { from: cur.clientLocationId, to: patch.clientLocationId },
      });
    }

    // NTE — the DELIBERATE 2nd writer of not_to_exceed_amount + the nte.adjusted billing event.
    if (patch.notToExceedAmount !== undefined && patch.notToExceedAmount !== cur.notToExceedAmount) {
      set.notToExceedAmount = patch.notToExceedAmount;
      changedFields.push("notToExceedAmount");
      await emitJobBillingEvent(tx, {
        tenantId, jobId, eventType: "nte.adjusted", actorUserId,
        summary: `Job NTE changed: ${cur.notToExceedAmount ?? "none"} → ${patch.notToExceedAmount ?? "none"}`,
        amount: patch.notToExceedAmount, currency: "USD",
        metadata: { from: cur.notToExceedAmount, to: patch.notToExceedAmount, level: "job" },
      });
    }

    // problem_description + scope_of_work — one job.scope_updated event covers both (metadata lists
    // which changed). problem_description is LOCKED for client/external-sourced jobs (server-enforced).
    const scopeMeta: { problemDescription?: boolean; scopeOfWork?: boolean } = {};
    if (patch.problemDescription !== undefined && patch.problemDescription !== cur.problemDescription) {
      if (patch.problemDescription.trim().length === 0) throw new Error("PROBLEM_DESCRIPTION_REQUIRED");
      if (!OPERATOR_DESCRIPTION_SOURCES.has(cur.sourceType)) throw new Error("PROBLEM_DESCRIPTION_LOCKED");
      set.problemDescription = patch.problemDescription;
      changedFields.push("problemDescription");
      scopeMeta.problemDescription = true;
    }
    if (patch.scopeOfWork !== undefined && (patch.scopeOfWork ?? null) !== (cur.scopeOfWork ?? null)) {
      set.scopeOfWork = patch.scopeOfWork ?? null;
      changedFields.push("scopeOfWork");
      scopeMeta.scopeOfWork = true;
    }
    if (scopeMeta.problemDescription || scopeMeta.scopeOfWork) {
      await tx.insert(jobEvents).values({
        tenantId, jobId, eventType: "job.scope_updated", actorUserId,
        summary: "Scope / description updated", metadata: scopeMeta,
      });
    }

    if (changedFields.length === 0) return; // no-op — no column write, no history/event/audit.

    await tx.update(jobs).set(set).where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));

    // ONE audit row (R-4.5: direct tx.insert, not writeAuditLog — atomic with the edit).
    await tx.insert(auditLogs).values({
      tenantId, userId: actorUserId, action: "job.updated", targetType: "job", targetId: jobId,
      metadata: { changedFields },
    });
  });

  const row = await getJob(tenantId, jobId);
  if (!row) throw new Error("Job update succeeded but row could not be reloaded.");
  return row;
}

/**
 * v2.11.0 — does the job have a LIVE vendor assignment (warn before editing trade/location)?
 * EXISTS over job_vendor_assignments ⋈ dispatch_assignment_statuses WHERE is_terminal = false AND
 * code != 'DRAFT' (SENT+ — a vendor actually dispatched; a DRAFT is operator workspace, allowed
 * silently). Advisory only — updateJob does NOT block on it (trade/location edits are warn-not-block).
 */
export async function hasActiveAssignment(tenantId: string, jobId: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobVendorAssignments.id })
    .from(jobVendorAssignments)
    .innerJoin(dispatchAssignmentStatuses, eq(jobVendorAssignments.currentStatusId, dispatchAssignmentStatuses.id))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.jobId, jobId),
        eq(dispatchAssignmentStatuses.isTerminal, false),
        ne(dispatchAssignmentStatuses.code, "DRAFT"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
