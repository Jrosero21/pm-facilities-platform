// ── Phase 12 batch 12f — EXTERNAL INTEGRATION CORE: adapter contract (types only) ─────
// core defines the adapter contract; adapters depend on core, never the reverse (§2.1 —
// the platform is source-agnostic, ServiceChannel is one channel among many). This file
// is PURE TYPES — no runtime logic, no DB, no "server-only" — so it is importable from
// anywhere (core, adapters, server ingest layer).
//
// Mapping (external_code → internal trade/status/priority id) is NOT an adapter concern —
// adapters only speak the provider's wire format. Code-resolution lives in core/mapping.ts
// (12g), driven by the external_*_mappings tables. (F8.)
//
// OQ-6 GUARD AT THE TYPE LEVEL: the outbound NormalizedStatusPush carries ONLY status +
// note — it CANNOT express cost, markup, or invoice data. Margin confidentiality is
// structurally impossible to leak through the outbound adapter surface.

import type { externalAccounts } from "@/server/schema/external-systems";

/** The external_accounts row — the connection identity an adapter operates against. */
export type ExternalAccount = typeof externalAccounts.$inferSelect;

// Enum value unions mirrored from the 0029/0030 schema so code and DB never drift.
export type SyncRunType = "inbound_pull" | "outbound_push" | "webhook";
export type MappingDirection = "inbound" | "outbound" | "both";

/**
 * The neutral, provider-agnostic shape an adapter's normalizePayload returns. The ingest
 * mapper (12h) consumes this: it resolves the external_* codes to internal ids via
 * core/mapping.ts, then calls createJob (sourceType='external_client_portal',
 * sourceExternalId=externalWoId). Fields are deliberately limited to what the inbound
 * createJob path can use — `raw` carries the original payload for external_payload_logs.
 */
export type NormalizedWorkOrder = {
  /** The provider's WO id → jobs.source_external_id + external_work_order_links.external_wo_id. */
  externalWoId: string;
  /** Provider CLIENT code (e.g. ServiceChannel SubscriberId) → resolved to a client via
   *  external_client_mappings (12h.0b). Required — client resolution is the first ingest
   *  step; an unmapped client parks the WO (IF-7). */
  externalClientCode: string;
  /** Provider LOCATION code (LocationId/StoreId) → resolved to a client_location via
   *  external_location_mappings, keyed WITHIN the resolved client (StoreId is per-client,
   *  D-12h.2). Required — an unmapped location auto-creates a stub (SF-2). */
  externalLocationCode: string;
  /** Provider status code → resolved to a job_status via external_status_mappings (12g). */
  externalStatusCode?: string;
  /** Provider trade code → resolved to a trade via external_trade_mappings (12g). */
  externalTradeCode?: string;
  /** Provider priority code → resolved to a priority via external_priority_mappings (12g). */
  externalPriorityCode?: string;
  /** Free-text problem description → jobs.problem_description. */
  problemDescription?: string;
  // ── Location detail (SF-2) — the adapter fills these from the provider payload (a
  // ServiceChannel WO carries the store address). The ingest mapper uses them to
  // auto-create a client_location STUB when the location is unmapped; a genuinely-absent
  // required field falls back to a hard-flagged [NEEDS REVIEW] placeholder (never invented).
  // core consumes them; the adapter (12j) populates them.
  locationName?: string;
  addressLine1?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  /** The original payload, carried through for external_payload_logs (never re-shaped). */
  raw: unknown;
};

/**
 * The neutral shape for an OUTBOUND status push. Carries status + an optional note ONLY —
 * deliberately NO cost / markup / invoice fields (OQ-6 guard at the type level). The core
 * resolves our internal status to the provider's code via external_status_mappings
 * (direction outbound/both) before handing it to the adapter.
 */
export type NormalizedStatusPush = {
  externalWoId: string;
  externalStatusCode: string;
  note?: string;
};

/** The result of an outbound push. */
export type PushResult = {
  ok: boolean;
  externalRef?: string;
  error?: string;
};

/**
 * The adapter contract (F8) — exactly three methods. An adapter translates between a
 * provider's wire format and these neutral shapes; it does NO id-mapping and NO DB work.
 *   - normalizePayload: provider body → NormalizedWorkOrder (e.g. a webhook/poll item)
 *   - fetchWorkOrders:  pull WOs for an account (optional `since` for incremental sync)
 *   - pushStatus:       send one status update outbound
 */
export interface PortalAdapter {
  normalizePayload(raw: unknown): NormalizedWorkOrder;
  fetchWorkOrders(
    account: ExternalAccount,
    since?: Date,
  ): Promise<NormalizedWorkOrder[]>;
  pushStatus(
    account: ExternalAccount,
    push: NormalizedStatusPush,
  ): Promise<PushResult>;
}
