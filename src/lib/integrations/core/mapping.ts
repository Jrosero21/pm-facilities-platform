// ── Phase 12 batch 12g — EXTERNAL INTEGRATION CORE: code-resolution (read-only) ───────
// Resolution only — no inserts, no policy, no adapter import (§2.1). Translates a
// provider's external codes into our internal reference ids via the external_*_mappings
// tables (0029). Mapping is a CORE concern, never an adapter concern (F8): the adapter
// speaks the provider's wire format; turning its codes into our ids happens here.
//
// Priority resolution is TENANT-SCOPED (F5 — priorities are per-tenant, so tenantId is a
// REQUIRED arg); status + trade target GLOBAL reference tables (no tenant dimension).
// Resolution is DIRECTION-AWARE (F4): an inbound resolve matches direction IN
// ('inbound','both'); outbound matches ('outbound','both').
//
// Unmapped codes return { matched: false } — NEVER thrown, guessed, or silently dropped.
// The ingest mapper (12h) decides per-field fallback (e.g. land at NEW / null trade).

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  externalStatusMappings,
  externalTradeMappings,
  externalPriorityMappings,
} from "@/server/schema";
import type { NormalizedWorkOrder } from "./types";

export type ResolveDirection = "inbound" | "outbound";

export type MappingResult<T> =
  | { matched: true; internalId: T }
  | { matched: false; externalCode: string };

/** Direction filter (F4): inbound also matches 'both'; outbound also matches 'both'. */
function directionValues(direction: ResolveDirection): ("inbound" | "outbound" | "both")[] {
  return direction === "inbound" ? ["inbound", "both"] : ["outbound", "both"];
}

/** Resolve a provider status code → job_status_id. Global (no tenant). */
export async function resolveStatus(opts: {
  externalSystemId: string;
  externalCode: string;
  direction: ResolveDirection;
}): Promise<MappingResult<string>> {
  const rows = await db
    .select({ jobStatusId: externalStatusMappings.jobStatusId })
    .from(externalStatusMappings)
    .where(
      and(
        eq(externalStatusMappings.externalSystemId, opts.externalSystemId),
        eq(externalStatusMappings.externalCode, opts.externalCode),
        inArray(externalStatusMappings.direction, directionValues(opts.direction)),
      ),
    )
    .limit(1);
  return rows[0]
    ? { matched: true, internalId: rows[0].jobStatusId }
    : { matched: false, externalCode: opts.externalCode };
}

/** Resolve a provider trade code → trade_id. Global (no tenant). */
export async function resolveTrade(opts: {
  externalSystemId: string;
  externalCode: string;
  direction: ResolveDirection;
}): Promise<MappingResult<string>> {
  const rows = await db
    .select({ tradeId: externalTradeMappings.tradeId })
    .from(externalTradeMappings)
    .where(
      and(
        eq(externalTradeMappings.externalSystemId, opts.externalSystemId),
        eq(externalTradeMappings.externalCode, opts.externalCode),
        inArray(externalTradeMappings.direction, directionValues(opts.direction)),
      ),
    )
    .limit(1);
  return rows[0]
    ? { matched: true, internalId: rows[0].tradeId }
    : { matched: false, externalCode: opts.externalCode };
}

/** Resolve a provider priority code → priority_id. TENANT-SCOPED (F5 — tenantId required). */
export async function resolvePriority(opts: {
  tenantId: string;
  externalSystemId: string;
  externalCode: string;
  direction: ResolveDirection;
}): Promise<MappingResult<string>> {
  const rows = await db
    .select({ priorityId: externalPriorityMappings.priorityId })
    .from(externalPriorityMappings)
    .where(
      and(
        eq(externalPriorityMappings.tenantId, opts.tenantId),
        eq(externalPriorityMappings.externalSystemId, opts.externalSystemId),
        eq(externalPriorityMappings.externalCode, opts.externalCode),
        inArray(externalPriorityMappings.direction, directionValues(opts.direction)),
      ),
    )
    .limit(1);
  return rows[0]
    ? { matched: true, internalId: rows[0].priorityId }
    : { matched: false, externalCode: opts.externalCode };
}

/**
 * Resolve all three code fields of a NormalizedWorkOrder (inbound). Each result is
 * returned independently so the ingest mapper (12h) can decide per-field fallback;
 * a code that's absent on the WO or unmapped yields matched:false (never throws).
 * Only the priority resolver receives tenantId (F5).
 */
export async function resolveWorkOrderCodes(opts: {
  tenantId: string;
  externalSystemId: string;
  wo: NormalizedWorkOrder;
  direction: "inbound";
}): Promise<{
  status: MappingResult<string>;
  trade: MappingResult<string>;
  priority: MappingResult<string>;
}> {
  const { tenantId, externalSystemId, wo, direction } = opts;

  const status = wo.externalStatusCode
    ? await resolveStatus({ externalSystemId, externalCode: wo.externalStatusCode, direction })
    : ({ matched: false, externalCode: "" } as const);

  const trade = wo.externalTradeCode
    ? await resolveTrade({ externalSystemId, externalCode: wo.externalTradeCode, direction })
    : ({ matched: false, externalCode: "" } as const);

  const priority = wo.externalPriorityCode
    ? await resolvePriority({ tenantId, externalSystemId, externalCode: wo.externalPriorityCode, direction })
    : ({ matched: false, externalCode: "" } as const);

  return { status, trade, priority };
}
