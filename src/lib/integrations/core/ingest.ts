import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  externalClientMappings,
  externalLocationMappings,
  externalWorkOrderLinks,
} from "@/server/schema";
import { createJob } from "@/server/jobs";
import { createLocation } from "@/server/client-locations";
import { resolveWorkOrderCodes } from "./mapping";
import { openRun, finalizeRun, logEvent, logPayload } from "./sync";
import type { NormalizedWorkOrder } from "./types";

// ── Phase 12 batch 12h-B — GENERIC INGEST ENGINE (the source-agnostic write crux) ─────
// Turns a provider-neutral NormalizedWorkOrder into one of our jobs rows + an
// external_work_order_links row, with full sync/payload logging. The engine does NO auth:
// it takes an already-pinned scope (tenantId + externalSystemId + createdByUserId) from
// the server wrapper (ingest-external-job.ts), which is the sole authz gate. §2.1: this
// imports NO adapter — it consumes a NormalizedWorkOrder the adapter already produced.
//
// Resolution order (12h-A.2): client → [park if unmapped, IF-7] → dedup [skip+touch, IF-3]
// → location-within-client → [auto-stub if unmapped, SF-2] → status/trade/priority
// [default+flag if unmapped, IF-1] → createJob @ NEW (IF-6) → ewol link (IF-4) → sync log.
//
// SYNC RUN: every ingest opens ONE external_sync_run (run_type='inbound_ingest') and
// references its real id on every sync_event — external_sync_events.sync_run_id is NOT
// NULL + FK→external_sync_runs, so a fabricated run id would violate the FK. The run is
// finalized (succeeded/partial/failed) before return. The run/event/payload primitives are
// the SHARED helpers in core/sync.ts (12i-B IO-3 — inbound ingest + outbound push use the
// same substrate); this refactor is behavior-preserving (same rows, same order).
//
// IF-6: external jobs land at NEW (createJob hardcodes it); the resolved mapped status is
// RECORDED in the wo_created sync_event metadata for operator triage, NOT auto-applied (no
// generic transition helper exists; auto-advance would breach R-5.8).
//
// IF-4 orphan window (KNOWN LIMITATION): createJob commits its own txn, then the ewol link
// is a separate insert. If the link insert fails after the job commits, the job exists
// unlinked; a re-ingest (dedup misses, no link) would create a SECOND job. There is no
// existing job-lookup by source_external_id to cheaply guard this, so per IF-4 it is a
// documented known limitation (the ewol unique still guards the normal concurrent
// double-ingest). A source-external-id reader is deferred (do-not-over-engineer).

export type IngestResult =
  | { outcome: "parked_unmapped_client"; externalClientCode: string; syncRunId: string; syncEventId: string }
  | { outcome: "skipped_already_linked"; jobId: string; linkId: string; syncRunId: string }
  | {
      outcome: "ingested";
      jobId: string;
      linkId: string;
      syncRunId: string;
      autoCreatedLocation: boolean;
      flags: string[];
    };

// Direction filter (F4): inbound resolution matches 'inbound' or 'both'.
const DIR_INBOUND = ["inbound", "both"] as const;

export async function ingestWorkOrder(
  ctx: { tenantId: string; externalSystemId: string; createdByUserId: string },
  wo: NormalizedWorkOrder,
): Promise<IngestResult> {
  const { tenantId, externalSystemId, createdByUserId } = ctx;

  // ── 0. Open the run (shared helper) + log the raw inbound payload (NEVER credentials) ──
  const { runId: syncRunId } = await openRun({
    tenantId,
    externalSystemId,
    runType: "inbound_ingest",
  });
  await logPayload({
    tenantId,
    externalSystemId,
    syncRunId,
    direction: "inbound",
    externalWoId: wo.externalWoId,
    payload: wo.raw,
  });

  try {
    // ── 1. RESOLVE CLIENT (IF-7: unmapped → park; no job, no auto-client) ──────────
    const clientRows = await db
      .select({ clientId: externalClientMappings.clientId })
      .from(externalClientMappings)
      .where(
        and(
          eq(externalClientMappings.externalSystemId, externalSystemId),
          eq(externalClientMappings.externalCode, wo.externalClientCode),
          inArray(externalClientMappings.direction, [...DIR_INBOUND]),
        ),
      )
      .limit(1);
    const clientMatch = clientRows[0];
    if (!clientMatch) {
      const { eventId: syncEventId } = await logEvent({
        tenantId,
        syncRunId,
        externalWoId: wo.externalWoId,
        eventType: "error",
        outcome: "error",
        message: `unmapped client ${wo.externalClientCode}`,
      });
      await finalizeRun(syncRunId, "partial", { parked: 1 }, `unmapped client ${wo.externalClientCode}`);
      return {
        outcome: "parked_unmapped_client",
        externalClientCode: wo.externalClientCode,
        syncRunId,
        syncEventId,
      };
    }
    const clientId = clientMatch.clientId;

    // ── 2. DEDUP (IF-3: already-linked → skip + touch last_synced_at) ──────────────
    const existingLink = (
      await db
        .select({ id: externalWorkOrderLinks.id, jobId: externalWorkOrderLinks.jobId })
        .from(externalWorkOrderLinks)
        .where(
          and(
            eq(externalWorkOrderLinks.externalSystemId, externalSystemId),
            eq(externalWorkOrderLinks.externalWoId, wo.externalWoId),
          ),
        )
        .limit(1)
    )[0];
    if (existingLink) {
      await db
        .update(externalWorkOrderLinks)
        .set({ lastSyncedAt: new Date() })
        .where(eq(externalWorkOrderLinks.id, existingLink.id));
      await logEvent({
        tenantId,
        syncRunId,
        externalWoId: wo.externalWoId,
        jobId: existingLink.jobId ?? undefined,
        eventType: "wo_updated",
        outcome: "skipped",
        message: "already linked — touched last_synced_at",
      });
      await finalizeRun(syncRunId, "succeeded", { skipped: 1 });
      return {
        outcome: "skipped_already_linked",
        jobId: existingLink.jobId ?? "",
        linkId: existingLink.id,
        syncRunId,
      };
    }

    const flags: string[] = [];

    // ── 3. RESOLVE LOCATION within client (unmapped → auto-stub, SF-2) ─────────────
    const locRows = await db
      .select({ clientLocationId: externalLocationMappings.clientLocationId })
      .from(externalLocationMappings)
      .where(
        and(
          eq(externalLocationMappings.externalSystemId, externalSystemId),
          eq(externalLocationMappings.clientId, clientId),
          eq(externalLocationMappings.externalCode, wo.externalLocationCode),
          inArray(externalLocationMappings.direction, [...DIR_INBOUND]),
        ),
      )
      .limit(1);
    let clientLocationId: string;
    let autoCreatedLocation = false;
    if (locRows[0]) {
      clientLocationId = locRows[0].clientLocationId;
    } else {
      const NR = "[NEEDS REVIEW]";
      let placeholderUsed = false;
      const pick = (v: string | undefined, fallback: string) => {
        if (v && v.trim()) return v;
        placeholderUsed = true;
        return fallback;
      };
      const created = await createLocation({
        tenantId,
        clientId,
        createdByUserId,
        name: wo.locationName?.trim() || `${NR} ${wo.externalLocationCode}`,
        addressLine1: pick(wo.addressLine1, NR),
        city: pick(wo.city, NR),
        stateProvince: pick(wo.stateProvince, NR),
        postalCode: pick(wo.postalCode, NR),
        country: wo.country,
      });
      clientLocationId = created.id;
      await db.insert(externalLocationMappings).values({
        id: uuidv7(),
        tenantId,
        externalSystemId,
        clientId,
        externalCode: wo.externalLocationCode,
        clientLocationId,
        direction: "both",
      });
      autoCreatedLocation = true;
      flags.push("auto_created_location");
      if (placeholderUsed || !wo.locationName?.trim()) {
        flags.push("location_needs_review");
      }
    }

    // ── 4. RESOLVE CODES (IF-1: unmapped → flag, pass undefined; createJob defaults) ──
    const codes = await resolveWorkOrderCodes({
      tenantId,
      externalSystemId,
      wo,
      direction: "inbound",
    });
    const tradeId = codes.trade.matched ? codes.trade.internalId : undefined;
    const priorityId = codes.priority.matched ? codes.priority.internalId : undefined;
    if (wo.externalTradeCode && !codes.trade.matched) flags.push("unmapped_trade");
    if (wo.externalPriorityCode && !codes.priority.matched) flags.push("unmapped_priority");
    if (wo.externalStatusCode && !codes.status.matched) flags.push("unmapped_status");
    // The resolved status id (if any) is RECORDED below, never applied (IF-6).
    const resolvedStatusId = codes.status.matched ? codes.status.internalId : null;

    // ── 5. createJob @ NEW (its own txn; sourceType pinned) ────────────────────────
    const job = await createJob({
      tenantId,
      clientId,
      clientLocationId,
      primaryTradeId: tradeId,
      priorityId,
      problemDescription: wo.problemDescription?.trim() || "[external WO]",
      sourceType: "external_client_portal",
      sourceExternalId: wo.externalWoId,
      createdByUserId,
    });

    // ── 6. ewol link (ewol unique guards concurrent double-ingest — IF-4) ──────────
    const linkId = uuidv7();
    await db.insert(externalWorkOrderLinks).values({
      id: linkId,
      tenantId,
      externalSystemId,
      externalWoId: wo.externalWoId,
      jobId: job.id,
      linkStatus: "active",
      lastSyncedAt: new Date(),
    });

    // ── 7. sync_event (wo_created; resolved status RECORDED not applied — IF-6) ─────
    await logEvent({
      tenantId,
      syncRunId,
      externalWoId: wo.externalWoId,
      jobId: job.id,
      eventType: "wo_created",
      outcome: "ok",
      message: flags.length ? `ingested with flags: ${flags.join(", ")}` : "ingested",
      metadata: { resolvedStatusId, flags, autoCreatedLocation },
    });

    await finalizeRun(syncRunId, "succeeded", { created: 1 });

    // ── 8. ──
    return { outcome: "ingested", jobId: job.id, linkId, syncRunId, autoCreatedLocation, flags };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort: record the failure on the run + an error event, then re-throw so the
    // caller sees it (the ewol unique / FK guards prevent partial-link corruption).
    await logEvent({
      tenantId,
      syncRunId,
      externalWoId: wo.externalWoId,
      eventType: "error",
      outcome: "error",
      message: message.slice(0, 2000),
    }).catch(() => {});
    await finalizeRun(syncRunId, "failed", {}, message.slice(0, 2000)).catch(() => {});
    throw err;
  }
}
