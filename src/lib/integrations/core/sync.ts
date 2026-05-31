import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  externalSyncRuns,
  externalSyncEvents,
  externalPayloadLogs,
  externalWorkOrderLinks,
  externalSystems,
  externalAccounts,
} from "@/server/schema";
import { getJob } from "@/server/jobs";
import { getAdapter } from "./registry";
import { resolveStatusOutbound } from "./mapping";
import type { NormalizedStatusPush, PushResult } from "./types";

// ── Phase 12 batch 12i-B — SHARED SYNC ORCHESTRATION + OUTBOUND PUSH ──────────────────
// Shared run/event/payload orchestration for inbound ingest AND outbound push (extracted
// from the inline quartet core/ingest.ts grew in 12h-B; ingest now consumes these — IO-3).
// NEVER logs credentials (IO-2/IO-4): logPayload writes only the caller-supplied body.
// §2.1: imports no concrete adapter — the outbound push obtains its adapter via the
// registry seam (getAdapter), which a provider self-registers (12j).

export type RunStatus = "succeeded" | "failed" | "partial";

/** Open an external_sync_run (status defaults 'running', started_at now). */
export async function openRun(opts: {
  tenantId: string;
  externalSystemId: string;
  runType: string;
}): Promise<{ runId: string }> {
  const runId = uuidv7();
  await db.insert(externalSyncRuns).values({
    id: runId,
    tenantId: opts.tenantId,
    externalSystemId: opts.externalSystemId,
    runType: opts.runType,
  });
  return { runId };
}

/** Finalize a run: status + finished_at + counts + error_summary. */
export async function finalizeRun(
  runId: string,
  status: RunStatus,
  counts: Record<string, number> = {},
  errorSummary?: string,
): Promise<void> {
  await db
    .update(externalSyncRuns)
    .set({ status, finishedAt: new Date(), counts, errorSummary: errorSummary ?? null })
    .where(eq(externalSyncRuns.id, runId));
}

/** Insert one external_sync_event under a run. */
export async function logEvent(opts: {
  tenantId: string;
  syncRunId: string;
  eventType: string;
  outcome: "ok" | "skipped" | "error";
  message?: string;
  metadata?: unknown;
  externalWoId?: string;
  jobId?: string;
}): Promise<{ eventId: string }> {
  const eventId = uuidv7();
  await db.insert(externalSyncEvents).values({
    id: eventId,
    tenantId: opts.tenantId,
    syncRunId: opts.syncRunId,
    externalWoId: opts.externalWoId ?? null,
    jobId: opts.jobId ?? null,
    eventType: opts.eventType,
    outcome: opts.outcome,
    message: opts.message ?? null,
    metadata: (opts.metadata ?? null) as object | null,
  });
  return { eventId };
}

/**
 * Insert one external_payload_log. REDACTION (IO-4): writes only the caller-provided
 * `payload` body — this fn NEVER reads or logs a credential. Callers must never pass
 * cost/markup/margin or secret material.
 */
export async function logPayload(opts: {
  tenantId: string;
  externalSystemId: string;
  syncRunId?: string;
  direction: "inbound" | "outbound";
  externalWoId?: string;
  payload: unknown;
}): Promise<void> {
  await db.insert(externalPayloadLogs).values({
    id: uuidv7(),
    tenantId: opts.tenantId,
    externalSystemId: opts.externalSystemId,
    syncRunId: opts.syncRunId ?? null,
    direction: opts.direction,
    externalWoId: opts.externalWoId ?? null,
    payload: opts.payload as object,
  });
}

// ── Outbound push (IO-1/IO-5) — explicit, no auto-hooks; skeleton no-op adapter ───────
// Resolves the external system via the job's ewol link, maps the job's CURRENT internal
// status → the provider's external code (outbound), and hands a NormalizedStatusPush
// (status+note ONLY — OQ-6, the type forbids cost/markup) to the registered adapter. The
// adapter is the 12j skeleton no-op until real HTTP lands; NO credentials are loaded here
// (IO-2). Every step is logged via the shared helpers; the payload_log records the push +
// PushResult, never a credential/margin (IO-4).
export async function pushStatusToExternal(opts: {
  tenantId: string;
  jobId: string;
  note?: string;
}): Promise<PushResult> {
  const { tenantId, jobId, note } = opts;

  // 1. The job's active external link (a purely-internal job has none → no push).
  const link = (
    await db
      .select({
        externalSystemId: externalWorkOrderLinks.externalSystemId,
        externalWoId: externalWorkOrderLinks.externalWoId,
      })
      .from(externalWorkOrderLinks)
      .where(
        and(
          eq(externalWorkOrderLinks.tenantId, tenantId),
          eq(externalWorkOrderLinks.jobId, jobId),
          eq(externalWorkOrderLinks.linkStatus, "active"),
        ),
      )
      .limit(1)
  )[0];
  if (!link) return { ok: false, error: "JOB_NOT_EXTERNALLY_LINKED" };

  // 2. The external system (provider + active check).
  const system = (
    await db
      .select({ provider: externalSystems.provider, status: externalSystems.status })
      .from(externalSystems)
      .where(eq(externalSystems.id, link.externalSystemId))
      .limit(1)
  )[0];
  if (!system) return { ok: false, error: "EXTERNAL_SYSTEM_NOT_FOUND" };
  if (system.status !== "active") return { ok: false, error: "EXTERNAL_SYSTEM_INACTIVE" };

  // 3. The job's current internal status → external code (outbound mapping).
  const job = await getJob(tenantId, jobId);
  if (!job) return { ok: false, error: "JOB_NOT_FOUND" };
  const mapped = await resolveStatusOutbound({
    externalSystemId: link.externalSystemId,
    jobStatusId: job.currentStatusId,
  });
  if (!mapped.matched) return { ok: false, error: "STATUS_NOT_MAPPED_OUTBOUND" };
  const externalStatusCode = mapped.externalCode;

  // 4. Open the run.
  const { runId } = await openRun({
    tenantId,
    externalSystemId: link.externalSystemId,
    runType: "outbound_push",
  });

  // 5. The neutral push payload — status + note ONLY (OQ-6; type forbids cost/markup).
  const push: NormalizedStatusPush = {
    externalWoId: link.externalWoId,
    externalStatusCode,
    note,
  };

  try {
    // 6. The account (the adapter's connection identity). NO credentials loaded (IO-2).
    const account = (
      await db
        .select()
        .from(externalAccounts)
        .where(
          and(
            eq(externalAccounts.externalSystemId, link.externalSystemId),
            eq(externalAccounts.status, "active"),
          ),
        )
        .limit(1)
    )[0];
    if (!account) {
      await logEvent({
        tenantId,
        syncRunId: runId,
        eventType: "status_pushed",
        outcome: "error",
        message: "no active external_account for system",
        externalWoId: link.externalWoId,
        jobId,
      });
      await finalizeRun(runId, "failed", {}, "NO_EXTERNAL_ACCOUNT");
      return { ok: false, error: "NO_EXTERNAL_ACCOUNT" };
    }

    // 6b. The adapter — registered by a provider (12j); a no-op skeleton for MVP.
    //     Until an adapter registers, getAdapter throws UNKNOWN_PROVIDER (handled below).
    const adapter = getAdapter(system.provider);
    const result = await adapter.pushStatus(account, push);

    // 7. Log the push + PushResult (NEVER credentials/cost/margin — IO-4).
    await logPayload({
      tenantId,
      externalSystemId: link.externalSystemId,
      syncRunId: runId,
      direction: "outbound",
      externalWoId: link.externalWoId,
      payload: { push, result },
    });
    await logEvent({
      tenantId,
      syncRunId: runId,
      eventType: "status_pushed",
      outcome: result.ok ? "ok" : "error",
      message: result.ok ? "pushed" : result.error ?? "push failed",
      metadata: { externalStatusCode, externalRef: result.externalRef ?? null },
      externalWoId: link.externalWoId,
      jobId,
    });
    await finalizeRun(runId, result.ok ? "succeeded" : "failed", { pushed: result.ok ? 1 : 0 });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEvent({
      tenantId,
      syncRunId: runId,
      eventType: "status_pushed",
      outcome: "error",
      message: message.slice(0, 2000),
      externalWoId: link.externalWoId,
      jobId,
    }).catch(() => {});
    await finalizeRun(runId, "failed", {}, message.slice(0, 2000)).catch(() => {});
    return { ok: false, error: message.slice(0, 500) };
  }
}
