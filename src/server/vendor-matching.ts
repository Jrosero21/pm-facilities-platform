import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { vendors } from "@/server/schema";
import { getJob } from "@/server/jobs";
import { getLocation } from "@/server/client-locations";

// Phase 5 cross-vendor matching (D-3.12 — a new query, not an extension of
// listVendorServiceAreas). Given a job's facets (trade + client-location
// city/state/postal), return the active vendors that are trade-eligible,
// geo-eligible, and compliance-eligible, ranked for the dispatch UI.
//
// v1 scope (Phase 5 decisions D-5.1…D-5.4):
//   - Geo match is EQUALITY-based (national / state / city / postal_code).
//     `radius` and `county` areas are stored but INERT — no client-location
//     coordinates (L-2.8/L-3.4) and no county column to compare (D-5.1).
//   - Compliance is non-blocking when absent (`no_data`); only explicit
//     expired/non_compliant active rows exclude. TEMPORARY — flips when
//     compliance data lands (D-5.2).
//   - Trade-eligibility and geo-eligibility are independent vendor-level
//     predicates; the branch-join is deferred and compensated in the 5d UI (D-5.3).
//   - "Active" means: vendor active AND each contributing coverage/area row is
//     vendor-wide OR its parent vendor_location is active (refinement A).

export type TradeScope = "vendor_wide" | "branch" | "both";
export type GeoMatchType = "postal_code" | "city" | "state" | "national";
export type ComplianceMatchStatus = "ok" | "no_data";

export type VendorCandidate = {
  vendorId: string;
  vendorName: string;
  vendorType: "local" | "regional" | "national";
  primaryTradeMatch: boolean;
  tradeScope: TradeScope;
  geoMatchTypes: GeoMatchType[];
  tightestGeoMatch: GeoMatchType;
  complianceStatus: ComplianceMatchStatus;
  // Phase 22 (additive): the location's preferred rank for this vendor+trade —
  // lower = stronger preference; null = not on the location's preferred list.
  // Ordering signal only; it never filters the candidate set.
  preferenceRank: number | null;
};

export type MatchFacets = {
  tenantId: string;
  // Phase 22 (additive): scope for the per-location blocklist + preferred-vendor
  // lookups. clientId is the blocklist's always-set anchor; clientLocationId
  // scopes both the blocklist (location vs client-wide) and the preferred list.
  clientId: string;
  clientLocationId: string;
  tradeId: string;
  city: string;
  state: string;
  postal: string;
};

const GEO_RANK_TO_TYPE: Record<number, GeoMatchType> = {
  1: "postal_code",
  2: "city",
  3: "state",
  4: "national",
};

/**
 * The parameterized, unit-testable matcher. Equality-based geo; ranks
 * primary-trade first, then tightest geo (postal>city>state>national), then name.
 */
export async function findCandidateVendorsForJobByFacets(
  facets: MatchFacets,
): Promise<VendorCandidate[]> {
  const { tenantId, clientId, clientLocationId, tradeId, city, state, postal } =
    facets;
  const stateUpper = state.trim().toUpperCase();
  // Qualified outer reference. Drizzle renders a bare vendors.id column
  // unqualified inside SELECT-list sql fragments, which is ambiguous against a
  // subquery table's own `id`; forcing `vendors`.`id` binds correlated
  // subqueries to the outer row.
  const vid = sql.raw("`vendors`.`id`");

  // Reused fragments. branchActive(x): the contributing row is vendor-wide, or
  // its parent vendor_location is active (refinement A).
  const tradeBranchActive = sql`(c.vendor_location_id IS NULL OR EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.id = c.vendor_location_id AND vl.status = 'active'))`;
  const areaBranchActive = sql`(a.vendor_location_id IS NULL OR EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.id = a.vendor_location_id AND vl.status = 'active'))`;
  // geoPredicate(a): equality match on the job facets. radius/county omitted → inert.
  const geoPredicate = sql`(a.area_type = 'national'
    OR (a.area_type = 'state' AND a.state_code = ${stateUpper})
    OR (a.area_type = 'city' AND a.city = ${city} AND a.state_code = ${stateUpper})
    OR (a.area_type = 'postal_code' AND a.postal_code = ${postal}))`;

  const rows = await db
    .select({
      vendorId: vendors.id,
      vendorName: vendors.name,
      vendorType: vendors.vendorType,
      primaryTradeMatch: sql<number>`COALESCE((
        SELECT MAX(c.is_primary) FROM vendor_trade_coverage c
        WHERE c.vendor_id = ${vid} AND c.trade_id = ${tradeId} AND c.status = 'active'
          AND ${tradeBranchActive}
      ), 0)`.as("primaryTradeMatch"),
      hasVendorWideTrade: sql<number>`EXISTS (
        SELECT 1 FROM vendor_trade_coverage c
        WHERE c.vendor_id = ${vid} AND c.trade_id = ${tradeId} AND c.status = 'active'
          AND c.vendor_location_id IS NULL
      )`,
      hasBranchTrade: sql<number>`EXISTS (
        SELECT 1 FROM vendor_trade_coverage c
        JOIN vendor_locations vl ON vl.id = c.vendor_location_id AND vl.status = 'active'
        WHERE c.vendor_id = ${vid} AND c.trade_id = ${tradeId} AND c.status = 'active'
      )`,
      geoMatchTypes: sql<string | null>`(
        SELECT GROUP_CONCAT(DISTINCT a.area_type) FROM vendor_service_areas a
        WHERE a.vendor_id = ${vid} AND a.status = 'active' AND ${areaBranchActive} AND ${geoPredicate}
      )`,
      tightestGeoRank: sql<number>`(
        SELECT MIN(CASE a.area_type WHEN 'postal_code' THEN 1 WHEN 'city' THEN 2 WHEN 'state' THEN 3 WHEN 'national' THEN 4 END)
        FROM vendor_service_areas a
        WHERE a.vendor_id = ${vid} AND a.status = 'active' AND ${areaBranchActive} AND ${geoPredicate}
      )`.as("tightestGeoRank"),
      complianceStatus: sql<string>`CASE WHEN EXISTS (
        SELECT 1 FROM vendor_compliance vc WHERE vc.vendor_id = ${vid} AND vc.status = 'active'
      ) THEN 'ok' ELSE 'no_data' END`,
      // Phase 22 (additive): the location's preferred rank for this vendor+trade.
      // MIN(priority) → strongest rank if listed at several priorities; NULL when
      // not preferred. Preference IS per-trade (trade clause present). This is an
      // ordering signal only — it never appears in the WHERE, so it never filters.
      preferenceRank: sql<number | null>`COALESCE((
        SELECT MIN(p.priority) FROM location_preferred_vendors p
        WHERE p.vendor_id = ${vid} AND p.status = 'active'
          AND p.tenant_id = ${tenantId} AND p.client_location_id = ${clientLocationId} AND p.trade_id = ${tradeId}
      ), NULL)`.as("preferenceRank"),
    })
    .from(vendors)
    .where(
      and(
        eq(vendors.tenantId, tenantId),
        eq(vendors.status, "active"),
        // trade-eligible
        sql`EXISTS (
          SELECT 1 FROM vendor_trade_coverage c
          WHERE c.vendor_id = ${vid} AND c.trade_id = ${tradeId} AND c.status = 'active' AND ${tradeBranchActive}
        )`,
        // geo-eligible
        sql`EXISTS (
          SELECT 1 FROM vendor_service_areas a
          WHERE a.vendor_id = ${vid} AND a.status = 'active' AND ${areaBranchActive} AND ${geoPredicate}
        )`,
        // compliance-eligible (no explicit expired/non_compliant active rows; D-5.2)
        sql`NOT EXISTS (
          SELECT 1 FROM vendor_compliance vc
          WHERE vc.vendor_id = ${vid} AND vc.status = 'active' AND vc.compliance_status IN ('expired','non_compliant')
        )`,
        // Phase 22: not-blocklisted (exclusion-before-preference). A block is a
        // COMPANY exclusion — it bars the vendor regardless of the job's trade, so
        // there is NO trade clause. client_location_id NULL = a client-wide ban
        // (all the client's locations); set = this-location-only.
        sql`NOT EXISTS (
          SELECT 1 FROM location_blocked_vendors b
          WHERE b.vendor_id = ${vid} AND b.status = 'active'
            AND b.tenant_id = ${tenantId} AND b.client_id = ${clientId}
            AND (b.client_location_id IS NULL OR b.client_location_id = ${clientLocationId})
        )`,
      ),
    )
    // Phase 22: preference LEADS (preferred vendors first, lower priority wins);
    // the existing three keys are the unchanged tiebreak tail.
    .orderBy(
      sql`(preferenceRank IS NULL) ASC, preferenceRank ASC, primaryTradeMatch DESC, tightestGeoRank ASC, ${vendors.name} ASC`,
    );

  return rows.map((r) => {
    const hasVendorWide = Number(r.hasVendorWideTrade) > 0;
    const hasBranch = Number(r.hasBranchTrade) > 0;
    const tradeScope: TradeScope =
      hasVendorWide && hasBranch ? "both" : hasVendorWide ? "vendor_wide" : "branch";
    const geoMatchTypes = (r.geoMatchTypes ?? "")
      .split(",")
      .filter(Boolean) as GeoMatchType[];
    return {
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      vendorType: r.vendorType,
      primaryTradeMatch: Number(r.primaryTradeMatch) > 0,
      tradeScope,
      geoMatchTypes,
      tightestGeoMatch: GEO_RANK_TO_TYPE[Number(r.tightestGeoRank)],
      complianceStatus: r.complianceStatus as ComplianceMatchStatus,
      preferenceRank: r.preferenceRank == null ? null : Number(r.preferenceRank),
    };
  });
}

/**
 * Resolve a job's facets (tenant-scoped) and run the matcher. Returns [] for a
 * missing/cross-tenant job, a job with no trade assigned, or no eligible vendors.
 */
export async function findCandidateVendorsForJob(
  tenantId: string,
  jobId: string,
): Promise<VendorCandidate[]> {
  const job = await getJob(tenantId, jobId);
  if (!job || !job.primaryTradeId) return [];
  const location = await getLocation(tenantId, job.clientLocationId);
  if (!location) return [];
  return findCandidateVendorsForJobByFacets({
    tenantId,
    clientId: job.clientId,
    clientLocationId: job.clientLocationId,
    tradeId: job.primaryTradeId,
    city: location.city,
    state: location.stateProvince,
    postal: location.postalCode,
  });
}
