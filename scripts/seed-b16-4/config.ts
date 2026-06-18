/**
 * B-16.4 dev-seed — P1: archetypes + config (pure, no DB).
 *
 * Generates a realistic synthetic vendor world for developing & validating
 * the vendor performance scorer (B-16.4). Sandbox-target by default; every
 * row namespaced under SEED_ codes + a dedicated tenant so teardown removes
 * ONLY this seed's data and never the existing phase9 fixture.
 *
 * Ground truth: each vendor is assigned a hidden ARCHETYPE that drives its
 * generated history. The manifest (P4) records vendor->archetype->expectedRank
 * so the harness can assert the scorer ranks reliable vendors above flaky ones.
 */

// ---- deterministic RNG (mulberry32) so runs reproduce + manifest is stable ----
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
export function rngPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
export function rngBool(rng: () => number, pTrue: number): boolean {
  return rng() < pTrue;
}

// ---- the fixed seed: change to regenerate a different (but reproducible) world ----
export const SEED = 0xB1640;

// ---- namespacing (teardown keys off these) ----
export const NS = {
  tenantName: "B16.4 Seed Aggregator",
  tenantSlug: "b164-seed-aggregator",
  clientName: "B16.4 Seed Client",
  vendorCodePrefix: "SEED-",       // every vendor: SEED-001 .. SEED-0NN
  manifestPath: "scripts/seed-b16-4/manifest.json",
} as const;

// ---- world size ----
export const WORLD = {
  vendorCount: 55,                 // "large" — stress ranking at scale
  assignmentsPerVendor: { min: 5, max: 30 }, // archetype re-weights within this
  tradesPerVendor: { min: 1, max: 3 },
} as const;

/**
 * Archetypes — the hidden quality profiles. Each is a probability/behavior
 * spec the P2/P3 generators sample from. expectedRankBand lets the harness
 * assert coarse ordering (1 = best) without over-fitting to exact scores.
 *
 *  acceptRate        — P(assignment is accepted vs declined after Sent)
 *  completeRate      — P(an accepted assignment reaches Work Complete vs Cancelled)
 *  onTimeRate        — P(check-in occurs at/before scheduled_start_at | completed)
 *  latenessMinsMax   — when late, how late check-in runs past schedule (upper bound)
 *  earlyMinsMax      — when on-time, how early check-in beats schedule (upper bound)
 *  assignmentScale   — multiplier on assignmentsPerVendor (newcomers get few)
 */
export type ArchetypeKey =
  | "reliable_fast" | "reliable_slow" | "flaky_fast"
  | "flaky_unreliable" | "newcomer_thin" | "random_noise";

export type Archetype = {
  key: ArchetypeKey;
  label: string;
  acceptRate: number;
  completeRate: number;
  onTimeRate: number;
  latenessMinsMax: number;
  earlyMinsMax: number;
  assignmentScale: number;
  expectedRankBand: number; // 1=best .. 5=worst; noise = 0 (unranked)
};

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  reliable_fast: {
    key: "reliable_fast", label: "Reliable / Fast",
    acceptRate: 0.95, completeRate: 0.97, onTimeRate: 0.92,
    latenessMinsMax: 20, earlyMinsMax: 45, assignmentScale: 1.0, expectedRankBand: 1,
  },
  reliable_slow: {
    key: "reliable_slow", label: "Reliable / Slow",
    acceptRate: 0.93, completeRate: 0.95, onTimeRate: 0.45, // completes, but often late
    latenessMinsMax: 120, earlyMinsMax: 15, assignmentScale: 1.0, expectedRankBand: 2,
  },
  flaky_fast: {
    key: "flaky_fast", label: "Flaky / Fast-when-present",
    acceptRate: 0.55, completeRate: 0.70, onTimeRate: 0.80, // good when they show, often don't
    latenessMinsMax: 30, earlyMinsMax: 40, assignmentScale: 1.0, expectedRankBand: 3,
  },
  flaky_unreliable: {
    key: "flaky_unreliable", label: "Flaky / Unreliable",
    acceptRate: 0.40, completeRate: 0.50, onTimeRate: 0.30, // the clear bad anchor
    latenessMinsMax: 180, earlyMinsMax: 10, assignmentScale: 1.0, expectedRankBand: 4,
  },
  newcomer_thin: {
    key: "newcomer_thin", label: "Newcomer / Thin history",
    acceptRate: 0.85, completeRate: 0.90, onTimeRate: 0.75, // decent, but tiny n (tests low-sample scoring)
    latenessMinsMax: 30, earlyMinsMax: 30, assignmentScale: 0.12, expectedRankBand: 3,
  },
  random_noise: {
    key: "random_noise", label: "Random / Noise",
    acceptRate: 0.65, completeRate: 0.65, onTimeRate: 0.50,
    latenessMinsMax: 90, earlyMinsMax: 30, assignmentScale: 1.0, expectedRankBand: 0, // unranked
  },
};

/**
 * Distribution of the 55 vendors across archetypes. Weighted to give the
 * scorer a crowded, messy field with clear anchors at both ends.
 */
export const ARCHETYPE_MIX: { key: ArchetypeKey; count: number }[] = [
  { key: "reliable_fast",     count: 10 },
  { key: "reliable_slow",     count: 10 },
  { key: "flaky_fast",        count: 10 },
  { key: "flaky_unreliable",  count: 10 },
  { key: "newcomer_thin",     count: 8  },
  { key: "random_noise",      count: 7  },
]; // = 55

// sanity: mix sums to vendorCount
export const MIX_TOTAL = ARCHETYPE_MIX.reduce((n, m) => n + m.count, 0);
