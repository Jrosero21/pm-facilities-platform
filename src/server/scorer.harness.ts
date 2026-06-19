// Standalone node:assert harness. The repo has no unit-test runner (no vitest /
// node:test); the established convention is tsx-run scripts. Run with:
//   pnpm exec tsx src/server/scorer.harness.ts
import assert from "node:assert/strict";
import type { GeoMatchType } from "./vendor-matching";
import {
  rankCandidates, shrinkScore, isCloseCall, toScoredCandidate, TRACK_RECORD_PRIOR,
  type ScoredCandidate, type TrackRecordInput,
} from "./scorer";

// The single geo value reused by both candidate builders below.
const GEO: GeoMatchType = "postal_code";

let pass = 0;
function test(name: string, fn: () => void) { fn(); pass++; console.log(`  ok ${name}`); }
function mk(o: Partial<ScoredCandidate> = {}): ScoredCandidate {
  const geo: GeoMatchType = o.tightestGeoMatch ?? GEO;
  return {
    vendorId: o.vendorId ?? "v",
    vendorName: o.vendorName ?? "Vendor",
    vendorType: o.vendorType ?? "local",
    primaryTradeMatch: o.primaryTradeMatch ?? true,
    tradeScope: o.tradeScope ?? "vendor_wide",
    geoMatchTypes: o.geoMatchTypes ?? [geo],
    tightestGeoMatch: geo,
    complianceStatus: o.complianceStatus ?? "ok",
    preferenceRank: o.preferenceRank ?? null,
    trackRecordScore: o.trackRecordScore ?? TRACK_RECORD_PRIOR,
    hasRecord: o.hasRecord ?? false,
  };
}
const order = (r: ScoredCandidate[]) => r.map((c) => c.vendorId);

// A bare (un-scored) VendorCandidate — the input shape the adapter scores.
function cand(o: Partial<import("./vendor-matching").VendorCandidate> = {}) {
  return {
    vendorId: o.vendorId ?? "v",
    vendorName: o.vendorName ?? "Vendor",
    vendorType: o.vendorType ?? "local",
    primaryTradeMatch: o.primaryTradeMatch ?? true,
    tradeScope: o.tradeScope ?? "vendor_wide",
    geoMatchTypes: o.geoMatchTypes ?? [GEO],
    tightestGeoMatch: o.tightestGeoMatch ?? GEO,
    complianceStatus: o.complianceStatus ?? "ok",
    preferenceRank: o.preferenceRank ?? null,
  } as import("./vendor-matching").VendorCandidate;
}

console.log("Phase 27 scorer harness");

test("shrinkScore: no/zero volume returns the prior", () => {
  assert.equal(shrinkScore(0.99, 0), TRACK_RECORD_PRIOR);
  assert.equal(shrinkScore(0.01, 0), TRACK_RECORD_PRIOR);
});
test("shrinkScore: thin perfect record loses to thick strong record", () => {
  assert.ok(shrinkScore(0.95, 50) > shrinkScore(1.0, 1));
});
test("preferred vendor wins even with a weaker record", () => {
  const preferred = mk({ vendorId: "pref", preferenceRank: 1, trackRecordScore: 0.40, hasRecord: true });
  const proven = mk({ vendorId: "proven", preferenceRank: null, trackRecordScore: 0.95, hasRecord: true });
  assert.deepEqual(order(rankCandidates([proven, preferred])), ["pref", "proven"]);
});
test("among non-preferred, higher track record wins", () => {
  const hi = mk({ vendorId: "hi", trackRecordScore: 0.90, hasRecord: true });
  const lo = mk({ vendorId: "lo", trackRecordScore: 0.55, hasRecord: true });
  assert.deepEqual(order(rankCandidates([lo, hi])), ["hi", "lo"]);
});
test("unproven beats proven-weak, loses to proven-strong", () => {
  const fresh = mk({ vendorId: "fresh", trackRecordScore: TRACK_RECORD_PRIOR, hasRecord: false });
  const weak = mk({ vendorId: "weak", trackRecordScore: 0.34, hasRecord: true });
  const strong = mk({ vendorId: "strong", trackRecordScore: 0.91, hasRecord: true });
  assert.deepEqual(order(rankCandidates([weak, fresh, strong])), ["strong", "fresh", "weak"]);
});
test("trade-fit (matcher order) breaks an exact track-record tie", () => {
  const primary = mk({ vendorId: "primary", primaryTradeMatch: true, trackRecordScore: 0.7, hasRecord: true });
  const covered = mk({ vendorId: "covered", primaryTradeMatch: false, trackRecordScore: 0.7, hasRecord: true });
  assert.deepEqual(order(rankCandidates([primary, covered])), ["primary", "covered"]);
});
test("multiple preferred: lower rank first, then track record", () => {
  const p2 = mk({ vendorId: "p2", preferenceRank: 2, trackRecordScore: 0.99, hasRecord: true });
  const p1 = mk({ vendorId: "p1", preferenceRank: 1, trackRecordScore: 0.10, hasRecord: true });
  assert.deepEqual(order(rankCandidates([p2, p1])), ["p1", "p2"]);
});
test("deterministic: identical inputs yield identical order", () => {
  const set = () => [
    mk({ vendorId: "a", trackRecordScore: 0.8, hasRecord: true }),
    mk({ vendorId: "b", trackRecordScore: 0.6, hasRecord: true }),
    mk({ vendorId: "c", preferenceRank: 1, trackRecordScore: 0.2, hasRecord: true }),
  ];
  assert.deepEqual(order(rankCandidates(set())), order(rankCandidates(set())));
});
test("isCloseCall: only when top two unsettled by preference and within epsilon", () => {
  assert.equal(isCloseCall(rankCandidates([
    mk({ vendorId: "x", trackRecordScore: 0.80, hasRecord: true }),
    mk({ vendorId: "y", trackRecordScore: 0.78, hasRecord: true }),
  ])), true);
  assert.equal(isCloseCall(rankCandidates([
    mk({ vendorId: "p", preferenceRank: 1, trackRecordScore: 0.80, hasRecord: true }),
    mk({ vendorId: "q", trackRecordScore: 0.79, hasRecord: true }),
  ])), false);
  assert.equal(isCloseCall(rankCandidates([
    mk({ vendorId: "m", trackRecordScore: 0.90, hasRecord: true }),
    mk({ vendorId: "n", trackRecordScore: 0.50, hasRecord: true }),
  ])), false);
});

test("adapter: absent record -> prior, unproven", () => {
  const s = toScoredCandidate(cand({ vendorId: "a" }), null);
  assert.equal(s.trackRecordScore, TRACK_RECORD_PRIOR);
  assert.equal(s.hasRecord, false);
});
test("adapter: null/empty/non-numeric completionRate -> prior, unproven", () => {
  for (const bad of [null, "", "n/a"] as (string | null)[]) {
    const s = toScoredCandidate(cand(), { completionRate: bad, totalDispatches: 7 });
    assert.equal(s.trackRecordScore, TRACK_RECORD_PRIOR);
    assert.equal(s.hasRecord, false);
  }
});
test("adapter: 0..100 string scaled to 0..1 and volume-shrunk", () => {
  const s = toScoredCandidate(cand(), { completionRate: "100.00", totalDispatches: 15 });
  assert.equal(s.hasRecord, true);
  assert.equal(s.trackRecordScore, shrinkScore(1.0, 15));
  assert.ok(s.trackRecordScore > TRACK_RECORD_PRIOR);
});
test("adapter: real sample row equals shrink of completionRate/100", () => {
  const s = toScoredCandidate(cand(), { completionRate: "84.62", totalDispatches: 13 });
  assert.equal(s.trackRecordScore, shrinkScore(84.62 / 100, 13));
});
test("adapter: usable rate but no volume (n null) collapses to prior", () => {
  const s = toScoredCandidate(cand(), { completionRate: "95.00", totalDispatches: null });
  assert.equal(s.trackRecordScore, TRACK_RECORD_PRIOR);
});
test("adapter+rank: higher completion wins among non-preferred", () => {
  const hi = toScoredCandidate(cand({ vendorId: "hi" }), { completionRate: "93.33", totalDispatches: 15 });
  const lo = toScoredCandidate(cand({ vendorId: "lo" }), { completionRate: "55.00", totalDispatches: 15 });
  assert.deepEqual(rankCandidates([lo, hi]).map((c) => c.vendorId), ["hi", "lo"]);
});
test("adapter+rank: preferred with NO record still beats non-preferred strong record", () => {
  const pref = toScoredCandidate(cand({ vendorId: "pref", preferenceRank: 1 }), null);
  const strong = toScoredCandidate(cand({ vendorId: "strong" }), { completionRate: "98.00", totalDispatches: 30 });
  assert.deepEqual(rankCandidates([strong, pref]).map((c) => c.vendorId), ["pref", "strong"]);
});
test("adapter+rank: thin-perfect loses to thick-strong via real rows", () => {
  const thin = toScoredCandidate(cand({ vendorId: "thin" }), { completionRate: "100.00", totalDispatches: 1 });
  const thick = toScoredCandidate(cand({ vendorId: "thick" }), { completionRate: "95.00", totalDispatches: 50 });
  assert.deepEqual(rankCandidates([thin, thick]).map((c) => c.vendorId), ["thick", "thin"]);
});

console.log(`\n${pass} passed`);
