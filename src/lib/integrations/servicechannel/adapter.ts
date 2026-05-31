// ── Phase 12 batch 12j — SERVICECHANNEL ADAPTER (SKELETON) ────────────────────────────
// The FIRST concrete provider adapter. Conforms to PortalAdapter; depends on core ONLY
// (../core/types) — never the reverse, never a sibling adapter, never the server layer
// (§2.1: the platform is source-agnostic; ServiceChannel is one channel among many).
//
// normalizePayload is the ONE real method — it translates a ServiceChannel work-order
// body into the neutral NormalizedWorkOrder the core ingest mapper consumes (core then
// does all id-mapping via external_*_mappings; the adapter does NO mapping, NO DB — F8).
// fetchWorkOrders + pushStatus are DEFERRED STUBS: live HTTP needs credentials, which are
// not built for MVP (F1/IO-2/IO-5). No credentials are read anywhere here.
//
// ServiceChannel field model (per API research):
//   - SubscriberId  → externalClientCode (the client; multi-client platform — D-12h.1)
//   - LocationId (globally unique) PREFERRED, else StoreId (per-subscriber) → externalLocationCode
//   - location address block → locationName / addressLine1 / city / stateProvince / postalCode / country (SF-2)
//   - Id / WorkOrderId → externalWoId
//   - Status / TradeName / Priority → external*Code (the core resolvers map these)
//   - Description → problemDescription ; the whole body → raw

import type {
  PortalAdapter,
  NormalizedWorkOrder,
  NormalizedStatusPush,
  PushResult,
  ExternalAccount,
} from "../core/types";

// A loose, documented view of the ServiceChannel WO payload. Real payloads carry far more;
// we narrow only the fields the neutral shape needs, defensively (all optional).
interface ServiceChannelLocation {
  LocationId?: string | number;
  StoreId?: string | number;
  Name?: string;
  Address?: string;
  Address1?: string;
  City?: string;
  State?: string;
  StateProvince?: string;
  PostalCode?: string;
  Zip?: string;
  Country?: string;
}
interface ServiceChannelWorkOrder {
  Id?: string | number;
  WorkOrderId?: string | number;
  SubscriberId?: string | number;
  Status?: string;
  TradeName?: string;
  Trade?: string;
  Priority?: string;
  Description?: string;
  Location?: ServiceChannelLocation;
  [k: string]: unknown;
}

/** Coerce a possibly-numeric provider id/code to a trimmed string (or undefined). */
function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

class ServiceChannelAdapter implements PortalAdapter {
  /**
   * Real mapping (the one non-stub method). Narrows the loose payload and fills the neutral
   * NormalizedWorkOrder. Missing fields → undefined; the core ingest mapper handles unmapped
   * codes (default+flag) and auto-creates a location stub from the address detail (SF-2).
   * externalWoId / externalClientCode / externalLocationCode are required by the type — we
   * fall back to "" when genuinely absent so the core's unmapped/park paths fire rather than
   * the adapter inventing data.
   */
  normalizePayload(raw: unknown): NormalizedWorkOrder {
    const wo = (raw ?? {}) as ServiceChannelWorkOrder;
    const loc = wo.Location ?? {};

    // Location code: prefer the globally-unique LocationId, else the per-subscriber StoreId.
    const externalLocationCode =
      str(loc.LocationId) ?? str(loc.StoreId) ?? "";

    return {
      externalWoId: str(wo.Id) ?? str(wo.WorkOrderId) ?? "",
      externalClientCode: str(wo.SubscriberId) ?? "",
      externalLocationCode,
      externalStatusCode: str(wo.Status),
      externalTradeCode: str(wo.TradeName) ?? str(wo.Trade),
      externalPriorityCode: str(wo.Priority),
      problemDescription: str(wo.Description),
      // Location detail (SF-2) — real address from the payload where present.
      locationName: str(loc.Name),
      addressLine1: str(loc.Address1) ?? str(loc.Address),
      city: str(loc.City),
      stateProvince: str(loc.StateProvince) ?? str(loc.State),
      postalCode: str(loc.PostalCode) ?? str(loc.Zip),
      country: str(loc.Country),
      raw,
    };
  }

  /**
   * DEFERRED STUB — live HTTP polling needs credentials (not built for MVP, F1/IO-5).
   * Returns []; the integration phase wires the real ServiceChannel API call.
   */
  async fetchWorkOrders(
    _account: ExternalAccount,
    _since?: Date,
  ): Promise<NormalizedWorkOrder[]> {
    return [];
  }

  /**
   * DEFERRED STUB no-op — live push needs credentials (IO-2/IO-5). Loads NO credentials;
   * returns a stub success so the generic outbound path (core/sync.ts) exercises end-to-end
   * with logging, while the network call lands in the integration phase.
   */
  async pushStatus(
    _account: ExternalAccount,
    _push: NormalizedStatusPush,
  ): Promise<PushResult> {
    return { ok: true, externalRef: "noop-skeleton" };
  }
}

export const serviceChannelAdapter: PortalAdapter = new ServiceChannelAdapter();
