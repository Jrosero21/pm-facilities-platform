// ── Phase 9 batch 9d — SANDBOX SEED FIXTURE (declarative ground truth) ────────────────
// Pure data — NO DB, NO "server-only". The single source of truth for the Phase-9 sandbox seed
// AND the retained analytics-readers harness (scripts/check-analytics-readers.ts). The seed
// (seed-sandbox-phase9.ts) INSERTS this; the harness IMPORTS this and derives expected aggregates
// by trivial independent filters/math (a fair oracle — plain filtering, not the readers' SQL).
//
// CO-VERSIONING CONTRACT (9d manifest §7): the seed + harness + this fixture are one unit. Editing
// the fixture changes both the seeded data and the harness's expectations in lockstep.
//
// Ages are in HOURS relative to the seed-run NOW(). Open jobs get a SINGLE status-history row
// (entry into their current status at NOW - ageHours) → their only interval is the open/censored
// one, so they DON'T feed the distribution readers (dual-population rule, manifest §9). Closed jobs
// get a full multi-row transition chain → those completed intervals feed timeInStatusDistribution.
// Each open job carries explicit expectedStalled + expectedTier labels (the §5 matrix's last two
// columns) as the harness's ground truth.

import { summarizeSeconds } from "@/server/analytics/percentile"; // pure util (no server-only/DB) — used by the 9d.6 distribution oracles below

export const SEED_TENANT = { slug: "phase9-seed-tenant", name: "Phase 9 Seed Tenant" } as const;

export const SEED_USERS = [
  { email: "admin@phase9seed.test", name: "Phase9 Admin", roleKey: "tenant_admin" },
  { email: "operator@phase9seed.test", name: "Phase9 Operator", roleKey: "operator" },
  { email: "accounting@phase9seed.test", name: "Phase9 Accounting", roleKey: "accounting" },
] as const;
export const SEED_USER_PASSWORD = "Phase9-Seed-Pw!"; // sandbox-only throwaway

// Clients (key → name + location names). Distribution makes topClientsByOpenJobs non-degenerate.
export const CLIENTS = [
  { key: "acme", name: "Acme Corp", locations: ["Acme HQ", "Acme Warehouse", "Acme Retail"] },
  { key: "globex", name: "Globex Inc", locations: ["Globex Tower", "Globex Annex"] },
  { key: "initech", name: "Initech LLC", locations: ["Initech Office"] },
  { key: "umbrella", name: "Umbrella Co", locations: ["Umbrella Lab"] },
] as const;

export const VENDORS = [
  { key: "coolair", name: "CoolAir HVAC" },
  { key: "piperight", name: "PipeRight Plumbing" },
  { key: "sparkelec", name: "SparkElec" },
] as const;

export type UrgencyTier = "stalled" | "overdue" | "unassigned-high-priority" | "aged";

export type OpenJobSpec = {
  key: string;
  statusCode: "NEW" | "SCHEDULED" | "DISPATCHED" | "IN_PROGRESS" | "ON_HOLD";
  ageHours: number; // dwell in current status (entry = NOW - ageHours)
  priorityCode: "EMERGENCY" | "URGENT" | "HIGH" | "ROUTINE" | "SCHEDULED" | null;
  tradeCode: string | null;
  clientKey: string;
  locIndex: number;
  assignments: number; // # of job_vendor_assignments to create
  checkIn: boolean; // create a vendor_check_in on the first assignment
  scheduledStartHours: number | null; // signed offset from NOW (neg = past); for SCHEDULED rule
  dueHours: number | null; // signed offset from NOW (neg = overdue)
  expectedStalled: boolean;
  expectedTier: UrgencyTier;
};

// 19 open jobs — verbatim from manifest §5A/§5C/§5D/§5F.
export const OPEN_JOBS: OpenJobSpec[] = [
  { key: "n1", statusCode: "NEW", ageHours: 1, priorityCode: "EMERGENCY", tradeCode: "HVAC", clientKey: "acme", locIndex: 0, assignments: 0, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: false, expectedTier: "unassigned-high-priority" },
  { key: "n2", statusCode: "NEW", ageHours: 1, priorityCode: "ROUTINE", tradeCode: "PLUMB", clientKey: "acme", locIndex: 1, assignments: 0, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: false, expectedTier: "aged" },
  { key: "n3", statusCode: "NEW", ageHours: 1, priorityCode: null, tradeCode: null, clientKey: "globex", locIndex: 0, assignments: 0, checkIn: false, scheduledStartHours: null, dueHours: 72, expectedStalled: false, expectedTier: "aged" },
  { key: "n4", statusCode: "NEW", ageHours: 6, priorityCode: "URGENT", tradeCode: "ELEC", clientKey: "acme", locIndex: 2, assignments: 0, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },
  { key: "n5", statusCode: "NEW", ageHours: 6, priorityCode: "ROUTINE", tradeCode: "CARP", clientKey: "globex", locIndex: 1, assignments: 0, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },

  { key: "s1", statusCode: "SCHEDULED", ageHours: 5, priorityCode: "HIGH", tradeCode: "HVAC", clientKey: "acme", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: 48, dueHours: 48, expectedStalled: false, expectedTier: "aged" },
  { key: "s2", statusCode: "SCHEDULED", ageHours: 5, priorityCode: "HIGH", tradeCode: "PLUMB", clientKey: "globex", locIndex: 0, assignments: 1, checkIn: true, scheduledStartHours: -3, dueHours: null, expectedStalled: false, expectedTier: "aged" },
  { key: "s3", statusCode: "SCHEDULED", ageHours: 5, priorityCode: "URGENT", tradeCode: "ELEC", clientKey: "acme", locIndex: 1, assignments: 1, checkIn: false, scheduledStartHours: -3, dueHours: null, expectedStalled: true, expectedTier: "stalled" },
  { key: "s4", statusCode: "SCHEDULED", ageHours: 5, priorityCode: "ROUTINE", tradeCode: "ROOF", clientKey: "initech", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: -3, dueHours: null, expectedStalled: true, expectedTier: "stalled" },

  { key: "d1", statusCode: "DISPATCHED", ageHours: 6, priorityCode: "ROUTINE", tradeCode: "HVAC", clientKey: "acme", locIndex: 2, assignments: 2, checkIn: false, scheduledStartHours: null, dueHours: -48, expectedStalled: false, expectedTier: "overdue" },
  { key: "d2", statusCode: "DISPATCHED", ageHours: 6, priorityCode: "ROUTINE", tradeCode: "PLUMB", clientKey: "globex", locIndex: 1, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: false, expectedTier: "aged" },
  { key: "d3", statusCode: "DISPATCHED", ageHours: 36, priorityCode: "HIGH", tradeCode: "ELEC", clientKey: "acme", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },
  { key: "d4", statusCode: "DISPATCHED", ageHours: 36, priorityCode: "ROUTINE", tradeCode: "CLEAN", clientKey: "initech", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },

  { key: "i1", statusCode: "IN_PROGRESS", ageHours: 12, priorityCode: "HIGH", tradeCode: "HVAC", clientKey: "acme", locIndex: 1, assignments: 1, checkIn: true, scheduledStartHours: null, dueHours: 24, expectedStalled: false, expectedTier: "aged" },
  { key: "i2", statusCode: "IN_PROGRESS", ageHours: 12, priorityCode: "ROUTINE", tradeCode: "PLUMB", clientKey: "globex", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: false, expectedTier: "aged" },
  { key: "i3", statusCode: "IN_PROGRESS", ageHours: 96, priorityCode: "URGENT", tradeCode: "ELEC", clientKey: "acme", locIndex: 2, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },
  { key: "i4", statusCode: "IN_PROGRESS", ageHours: 96, priorityCode: "ROUTINE", tradeCode: "ROOF", clientKey: "umbrella", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },

  { key: "h1", statusCode: "ON_HOLD", ageHours: 24, priorityCode: "ROUTINE", tradeCode: "CARP", clientKey: "initech", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: false, expectedTier: "aged" },
  { key: "h2", statusCode: "ON_HOLD", ageHours: 240, priorityCode: "HIGH", tradeCode: "HVAC", clientKey: "acme", locIndex: 0, assignments: 1, checkIn: false, scheduledStartHours: null, dueHours: null, expectedStalled: true, expectedTier: "stalled" },
];

// Closed jobs (terminal) — multi-row transition chains feed the distribution readers (completed
// intervals only). Each segment {code, hours} = the job dwelt `hours` in `code` before the next
// transition. The terminal status (last) has no trailing interval. `dispatchAfterHours` (if set) =
// hours after job creation that an assignment was created → feeds timeToDispatchDistribution.
export type ClosedJobSpec = {
  key: string;
  clientKey: string;
  tradeCode: string;
  chain: { code: string; hours: number }[]; // last entry's hours ignored (terminal)
  dispatchAfterHours: number | null;
};

const COMPLETED_TEMPLATES: { code: string; hours: number }[][] = [
  [{ code: "NEW", hours: 2 }, { code: "SCHEDULED", hours: 4 }, { code: "IN_PROGRESS", hours: 6 }, { code: "COMPLETED", hours: 0 }],
  [{ code: "NEW", hours: 1 }, { code: "DISPATCHED", hours: 3 }, { code: "IN_PROGRESS", hours: 8 }, { code: "COMPLETED", hours: 0 }],
  [{ code: "NEW", hours: 3 }, { code: "SCHEDULED", hours: 6 }, { code: "ON_HOLD", hours: 24 }, { code: "IN_PROGRESS", hours: 5 }, { code: "COMPLETED", hours: 0 }],
];
const CANCELLED_TEMPLATES: { code: string; hours: number }[][] = [
  [{ code: "NEW", hours: 5 }, { code: "CANCELLED", hours: 0 }],
  [{ code: "NEW", hours: 2 }, { code: "SCHEDULED", hours: 10 }, { code: "CANCELLED", hours: 0 }],
];
const CLOSED_CLIENTS = ["acme", "globex", "initech", "umbrella"];
const CLOSED_TRADES = ["HVAC", "PLUMB", "ELEC", "CARP", "ROOF", "CLEAN"];

function buildClosed(): ClosedJobSpec[] {
  const out: ClosedJobSpec[] = [];
  // 12 COMPLETED: 3 templates × 4 scale factors (1.0, 1.5, 2.0, 3.0) — deterministic, varied dwells.
  const scales = [1, 1.5, 2, 3];
  let idx = 0;
  for (let s = 0; s < scales.length; s++) {
    for (let t = 0; t < COMPLETED_TEMPLATES.length; t++) {
      const chain = COMPLETED_TEMPLATES[t].map((seg) => ({ code: seg.code, hours: Math.round(seg.hours * scales[s]) }));
      // dispatch happens when the job leaves NEW (cumulative hours of the NEW segment).
      const dispatchAfterHours = chain[0].hours;
      out.push({ key: `c${idx + 1}`, clientKey: CLOSED_CLIENTS[idx % CLOSED_CLIENTS.length], tradeCode: CLOSED_TRADES[idx % CLOSED_TRADES.length], chain, dispatchAfterHours });
      idx++;
    }
  }
  // 4 CANCELLED: 2 templates × 2 scales. No dispatch.
  let cidx = 0;
  for (let s = 0; s < 2; s++) {
    for (let t = 0; t < CANCELLED_TEMPLATES.length; t++) {
      const chain = CANCELLED_TEMPLATES[t].map((seg) => ({ code: seg.code, hours: Math.round(seg.hours * (s === 0 ? 1 : 2)) }));
      out.push({ key: `x${cidx + 1}`, clientKey: CLOSED_CLIENTS[cidx % CLOSED_CLIENTS.length], tradeCode: CLOSED_TRADES[cidx % CLOSED_TRADES.length], chain, dispatchAfterHours: null });
      cidx++;
    }
  }
  return out;
}
export const CLOSED_JOBS: ClosedJobSpec[] = buildClosed();

// Billing fixture (manifest §5E). Each invoice attaches to a closed job (by index into CLOSED_JOBS).
// expectedPending per the strict-AP / AR predicates (manifest §4).
export type VendorInvoiceSpec = { status: "received" | "under_review" | "approved" | "disputed" | "paid"; paymentStatus: "unpaid" | "partially_paid" | "paid"; total: string; expectedPending: boolean };
export type ClientInvoiceSpec = { status: "draft" | "sent" | "void"; paymentStatus: "unpaid" | "partially_paid" | "paid"; total: string; expectedPending: boolean };

export const VENDOR_INVOICES: VendorInvoiceSpec[] = [
  ...Array.from({ length: 5 }, () => ({ status: "approved" as const, paymentStatus: "unpaid" as const, total: "500.00", expectedPending: true })),
  ...Array.from({ length: 3 }, () => ({ status: "approved" as const, paymentStatus: "partially_paid" as const, total: "750.00", expectedPending: true })),
  ...Array.from({ length: 2 }, () => ({ status: "approved" as const, paymentStatus: "paid" as const, total: "300.00", expectedPending: false })),
  { status: "received", paymentStatus: "unpaid", total: "400.00", expectedPending: false },
  { status: "under_review", paymentStatus: "unpaid", total: "450.00", expectedPending: false },
];
export const CLIENT_INVOICES: ClientInvoiceSpec[] = [
  ...Array.from({ length: 5 }, () => ({ status: "sent" as const, paymentStatus: "unpaid" as const, total: "1000.00", expectedPending: true })),
  ...Array.from({ length: 2 }, () => ({ status: "draft" as const, paymentStatus: "unpaid" as const, total: "900.00", expectedPending: false })),
  ...Array.from({ length: 2 }, () => ({ status: "void" as const, paymentStatus: "unpaid" as const, total: "200.00", expectedPending: false })),
  ...Array.from({ length: 2 }, () => ({ status: "sent" as const, paymentStatus: "paid" as const, total: "1200.00", expectedPending: false })),
];

// ── Harness oracle helpers (pure; derived from the fixture above) ─────────────────────
export const TOTAL_OPEN = OPEN_JOBS.length;
export const expectedStalledTotal = OPEN_JOBS.filter((j) => j.expectedStalled).length;
export function expectedStalledByStatus(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const j of OPEN_JOBS) if (j.expectedStalled) m[j.statusCode] = (m[j.statusCode] ?? 0) + 1;
  return m;
}
export function expectedOpenByStatus(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const j of OPEN_JOBS) m[j.statusCode] = (m[j.statusCode] ?? 0) + 1;
  return m;
}
export function expectedOpenByPriority(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const j of OPEN_JOBS) if (j.priorityCode) m[j.priorityCode] = (m[j.priorityCode] ?? 0) + 1;
  return m;
}
export function expectedTierCounts(): Record<UrgencyTier, number> {
  const m = { stalled: 0, overdue: 0, "unassigned-high-priority": 0, aged: 0 } as Record<UrgencyTier, number>;
  for (const j of OPEN_JOBS) m[j.expectedTier]++;
  return m;
}
export const expectedVendorPending = VENDOR_INVOICES.filter((i) => i.expectedPending).length;
export const expectedClientPending = CLIENT_INVOICES.filter((i) => i.expectedPending).length;

// ── Added 9d.6 — oracle helpers for the 4 distribution/top-N readers ──────────────────
// percentile.ts is a PURE util (no server-only, no DB) — importing it here keeps all oracle math in
// one place (manifest §7) without compromising this file's "pure data" contract. The oracle derives
// the expected *input arrays* from the fixture by trivial filters; applying the same separately-unit-
// tested summarizeSeconds to both oracle and reader is a fair test of the SQL extraction/attribution
// (the value the readers add), not a tautology over the percentile math. (Import is at file top.)

const clientNameByKey = new Map<string, string>(CLIENTS.map((c) => [c.key, c.name]));

/** Top clients by OPEN-job count, desc. Counts are distinct (10/5/3/1) → unambiguous order. */
export function expectedTopClients(): Array<{ name: string; count: number }> {
  const m = new Map<string, number>();
  for (const j of OPEN_JOBS) m.set(j.clientKey, (m.get(j.clientKey) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, count]) => ({ name: clientNameByKey.get(key)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Top trades by OPEN-job count, desc (jobs with null trade excluded — reader INNER JOINs trades). */
export function expectedTopTrades(): Array<{ code: string; count: number }> {
  const m = new Map<string, number>();
  for (const j of OPEN_JOBS) if (j.tradeCode) m.set(j.tradeCode, (m.get(j.tradeCode) ?? 0) + 1);
  return [...m.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Completed-interval seconds per departed status, from the closed-job chains. Attribution mirrors
 *  the reader: seg[i].hours accrues to seg[i].code for every segment EXCEPT the terminal (last) one;
 *  the first row per job has no LAG predecessor and contributes nothing. Open jobs (single history
 *  row) never feed this. */
export function expectedTimeInStatusSeconds(): Record<string, number[]> {
  const m: Record<string, number[]> = {};
  for (const cj of CLOSED_JOBS) {
    for (let i = 0; i < cj.chain.length - 1; i++) {
      (m[cj.chain[i].code] ??= []).push(cj.chain[i].hours * 3600);
    }
  }
  return m;
}
export function expectedTimeInStatus(): Record<string, ReturnType<typeof summarizeSeconds>> {
  const raw = expectedTimeInStatusSeconds();
  const out: Record<string, ReturnType<typeof summarizeSeconds>> = {};
  for (const [code, vals] of Object.entries(raw)) out[code] = summarizeSeconds(vals);
  return out;
}

/** Time-to-dispatch intervals (seconds). AS-BUILT: only OPEN jobs get assignments (at
 *  job.createdAt + 3600s); closed jobs get none — so ClosedJobSpec.dispatchAfterHours is currently
 *  vestigial (see 9d.6 report). One uniform 3600s interval per open job with ≥1 assignment. */
export function expectedDispatchSeconds(): number[] {
  return OPEN_JOBS.filter((j) => j.assignments > 0).map(() => 3600);
}
export function expectedDispatch(): ReturnType<typeof summarizeSeconds> {
  return summarizeSeconds(expectedDispatchSeconds());
}

// ── Phase 10 batch 10j — VENDOR PORTAL FIXTURE EXTENSION ────────────────────
// One vendor user, bound to the alphabetically-first seeded vendor (CoolAir).
// All of SEED_TENANT / VENDORS / SEED_USERS are pure DECLARATIVE specs with NO
// DB ids (ids are assigned at insert time: tenant/vendor via uuidv7, user via
// better-auth's random id generator). So the binding here is by KEY, not id;
// the seed resolves the bound vendor's id from its in-process vendorList, and
// the harness resolves tenant/vendor/user ids from the DB at run time.
//
// Co-versioning contract (Phase 10g harness convention extended): seed +
// fixture + harness commit together. Adding/modifying this block requires
// touching scripts/seed-sandbox-phase9.ts and scripts/check-vendor-predicates.ts
// in the same commit.

export const SEED_VENDOR_USER = {
  email: "vendor@phase9seed.test",
  name: "Vendor User",
  // Password reuses SEED_USER_PASSWORD; no separate const.
  roleKey: "vendor_user",
  // Vendor binding by VENDORS key (CoolAir = alphabetically first of the three
  // seeded vendors). Rebinding requires only changing this key.
  boundVendorKey: "coolair",
} as const;

/** Bound vendor's declarative name, derived from VENDORS by key. The harness
 *  resolves this name → vendor id within SEED_TENANT (ids aren't in the fixture). */
export function boundVendorName(): string {
  const v = VENDORS.find((x) => x.key === SEED_VENDOR_USER.boundVendorKey);
  if (!v) throw new Error(`boundVendorKey ${SEED_VENDOR_USER.boundVendorKey} not in VENDORS`);
  return v.name;
}

/** Expected getVendorScope size for SEED_VENDOR_USER: bound to exactly one vendor. */
export const EXPECTED_VENDOR_SCOPE_SIZE = 1;

/** Expected non-DRAFT assignment count for the bound vendor under SEED_TENANT.
 *  Empirically derived in 10j-construct Step 2: all 5 of CoolAir's seeded
 *  assignments are ACCEPTED (zero DRAFT), so the DRAFT-excluding list reader
 *  returns 5. Must move in lockstep if the seed's assignment status mix changes. */
export const EXPECTED_VENDOR_LIST_COUNT = 5;
