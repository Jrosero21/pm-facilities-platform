import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  auditLogs,
  changeOrders,
  clientInvoices,
  jobEvents,
  jobStatusHistory,
  jobStatuses,
  jobs,
  proposals,
  vendorInvoices,
} from "@/server/schema";
import { emitJobBillingEvent } from "@/server/billing/events";
import { getJobMargin } from "@/server/billing/margin";
import { JobAlreadyBillingClosed } from "@/server/billing/errors";

// ── Phase 8 batch 8c.10 — BILLING-CLOSE DATA LAYER (#20/#21) ──────────────────────────
// The first billing writer that crosses into the OPERATIONAL job lifecycle. markBillingClosed
// transitions the job to the CLOSED_BILLED terminal status and dual-writes the operational
// history (job_status_history + job_events) + billing-domain event (billing.closed) + audit_logs,
// all atomic in one txn (D-4.6). It REPLICATES the Phase-4 status-transition pattern INLINE via
// SCHEMA imports (it does not import the jobs data-layer module) — the pattern is logic-free
// inserts, so there is nothing to drift; this preserves billing's module-graph isolation.
//
// NARROWED sole-writer guarantee: this writer DOES write the jobs table (current_status_id +
// closed_at) — intended, the first billing writer to do so — but NEVER the job NTE column (the
// 8c.4 sole-writer rule was about that column specifically). closed_at is first-close-wins
// (COALESCE) so an earlier operational-close timestamp is preserved (OQ-26: operational close and
// billing close are independent; billing close transitions from ANY status, idempotent on
// already-CLOSED_BILLED). The accounting gate lives in the action layer; this trusts its callers.

type CloseConcern = { type: string; count: number };

/**
 * Transition a job to CLOSED_BILLED (accounting-gated at the action layer). Atomic dual-domain
 * write: jobs (status + closed_at) + job_status_history + job_events + billing.closed + audit.
 * The final margin is captured as a point-in-time snapshot in the billing.closed metadata —
 * computed BEFORE the txn (getJobMargin reads via the module db; the close mutates no invoices,
 * so the just-before read is consistent).
 */
export async function markBillingClosed(input: {
  tenantId: string;
  jobId: string;
  actorUserId: string | null;
  note?: string | null;
}): Promise<void> {
  const closedBilled = (
    await db.select({ id: jobStatuses.id }).from(jobStatuses).where(eq(jobStatuses.code, "CLOSED_BILLED")).limit(1)
  )[0];
  if (!closedBilled) throw new Error("STATUS_NOT_FOUND");

  const finalMargin = await getJobMargin(input.tenantId, input.jobId); // snapshot BEFORE the txn

  await db.transaction(async (tx) => {
    const job = (
      await tx
        .select({ statusId: jobs.currentStatusId, closedAt: jobs.closedAt })
        .from(jobs)
        .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)))
        .for("update")
    )[0];
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (job.statusId === closedBilled.id) throw new JobAlreadyBillingClosed(input.jobId);

    const now = new Date();
    // jobs UPDATE: ONLY status + closed_at (first-close-wins). NEVER the job NTE column.
    await tx
      .update(jobs)
      .set({ currentStatusId: closedBilled.id, closedAt: job.closedAt ?? now })
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)));

    // Operational history (the Phase-4 inline pattern, replicated).
    await tx.insert(jobStatusHistory).values({
      tenantId: input.tenantId, jobId: input.jobId,
      fromStatusId: job.statusId, toStatusId: closedBilled.id,
      changedByUserId: input.actorUserId, note: input.note ?? null,
    });
    await tx.insert(jobEvents).values({
      tenantId: input.tenantId, jobId: input.jobId,
      eventType: "job.status_changed", actorUserId: input.actorUserId,
      summary: "Status changed to Closed (Billed)",
      metadata: { fromStatusId: job.statusId, toStatus: "CLOSED_BILLED", reason: "billing_close" },
    });

    // Billing-domain event (job-level; no record refs).
    await emitJobBillingEvent(tx, {
      tenantId: input.tenantId, jobId: input.jobId, eventType: "billing.closed",
      actorUserId: input.actorUserId,
      summary: input.note ? `Billing closed: ${input.note}` : "Billing closed",
      metadata: { note: input.note ?? null, finalMargin },
    });

    // Audit — direct tx.insert (atomicity over resilience), mirroring createJob.
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId, action: "billing.closed",
      targetType: "job", targetId: input.jobId,
      metadata: { note: input.note ?? null, finalMargin },
    });
  });
}

/**
 * Soft "ready to close" advisory (8c-D6) — computed-on-read, ADVISORY ONLY. markBillingClosed
 * never consults this; an operator may close with outstanding concerns (write-offs, offline-
 * resolved disputes, etc.). Each concern is included only when its count > 0; ready = no concerns.
 */
export async function getBillingCloseReadiness(
  tenantId: string,
  jobId: string,
): Promise<{ ready: boolean; concerns: CloseConcern[] }> {
  const concerns: CloseConcern[] = [];
  const add = (type: string, n: number) => {
    if (n > 0) concerns.push({ type, count: n });
  };

  const unpaidVendor = Number(
    (await db.select({ c: count() }).from(vendorInvoices).where(and(
      eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.jobId, jobId),
      eq(vendorInvoices.status, "approved"), inArray(vendorInvoices.paymentStatus, ["unpaid", "partially_paid"]),
    )))[0]?.c ?? 0,
  );
  add("unpaid_approved_vendor_invoices", unpaidVendor);

  const unpaidClient = Number(
    (await db.select({ c: count() }).from(clientInvoices).where(and(
      eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.jobId, jobId),
      eq(clientInvoices.status, "sent"), inArray(clientInvoices.paymentStatus, ["unpaid", "partially_paid"]),
    )))[0]?.c ?? 0,
  );
  add("unpaid_sent_client_invoices", unpaidClient);

  const unresolvedVendor = Number(
    (await db.select({ c: count() }).from(vendorInvoices).where(and(
      eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.jobId, jobId),
      inArray(vendorInvoices.status, ["received", "under_review"]),
    )))[0]?.c ?? 0,
  );
  add("unresolved_vendor_invoices", unresolvedVendor);

  const disputedVendor = Number(
    (await db.select({ c: count() }).from(vendorInvoices).where(and(
      eq(vendorInvoices.tenantId, tenantId), eq(vendorInvoices.jobId, jobId),
      eq(vendorInvoices.status, "disputed"),
    )))[0]?.c ?? 0,
  );
  add("disputed_vendor_invoices", disputedVendor);

  const draftClient = Number(
    (await db.select({ c: count() }).from(clientInvoices).where(and(
      eq(clientInvoices.tenantId, tenantId), eq(clientInvoices.jobId, jobId),
      eq(clientInvoices.status, "draft"),
    )))[0]?.c ?? 0,
  );
  add("draft_client_invoices", draftClient);

  const openProposals = Number(
    (await db.select({ c: count() }).from(proposals).where(and(
      eq(proposals.tenantId, tenantId), eq(proposals.jobId, jobId),
      inArray(proposals.status, ["draft", "sent", "viewed"]),
    )))[0]?.c ?? 0,
  );
  add("open_proposals", openProposals);

  const openChangeOrders = Number(
    (await db.select({ c: count() }).from(changeOrders).where(and(
      eq(changeOrders.tenantId, tenantId), eq(changeOrders.jobId, jobId),
      eq(changeOrders.status, "submitted"),
    )))[0]?.c ?? 0,
  );
  add("open_change_orders", openChangeOrders);

  return { ready: concerns.length === 0, concerns };
}
