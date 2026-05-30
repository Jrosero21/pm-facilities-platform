# Phase 9 — Aggregator Dashboard & Analytics MVP · Carry-Forwards

Items carried forward at the `v1.0.0-phase-9` close. This ledger records **Phase 9-originated** carry-forwards (the new entries) plus **treatment notes** for the Phase-8 carry-forwards that Phase 9 work affected. Phase-8 CFs that Phase 9 did not touch remain in `docs/phase-8-billing-proposals/closeout-carryforwards.md` (the authoritative Phase-8 ledger) and are summarized here for completeness only. Distinct from standing non-CF watchpoints, which live in `10-known-limitations.md §B`.

CF-id convention (inherited): `CF-<sub-batch>.<sequence>`.

---

## CF-9d.6.1 — Dispatch-timing distribution is degenerate-by-design (seed coverage gap)

**What.** The 9d sandbox seed creates **no closed-job assignments**, so `timeToDispatchDistribution` is fed only by the 14 open-job assignments, all at a uniform **3600s** (`ClosedJobSpec.dispatchAfterHours` is declared but never seeded — vestigial). Reader correctness is proven by the harness (23/23 PASS); its **percentile *ordering* is not exercised** (p50 = p90 = mean = 3600s).

**Obligation (future seed strengthening).** Seed **varied dispatch deltas** across both open and closed jobs, converting the metric's coverage from "reader returns a number" to "reader returns a *meaningful distribution*."

**Blocker condition.** None — a coverage gap, not a bug. The reader is correct; the uniform delta was the deliberate 9d.4 "ttd oracle-simplicity" decision.

**Recommended discharge.** When the seed is first edited post-Phase-9 (e.g. when Phase 14 PM analytics need varied visit-to-dispatch times), strengthen this coverage in the same change.

**Refs.** `9d-manifest.md §7`; `10-known-limitations.md §A`; 9d.7 commit (`08b77f1`).

---

## CF-9e.4.1 — `/jobs` active-filter indicator is count-only, not a labeled chip

**What.** The `/jobs` active-filter indicator renders **"Showing N filtered jobs · Clear filters,"** not a labeled chip (`Status: In Progress ✕`). The count form honors the pinned **IDs-only** `resolveJobsFilters` contract and avoids two label-lookup `SELECT`s per request; operators arrive via a dashboard card click (they know which filter they applied) and need the active-filter signal + an escape hatch, not a re-statement.

**Obligation (future UX refinement).** If bookmark / URL-share workflows surface a need for label visibility (users who don't remember which filter they applied), extend `resolveJobsFilters` to also return the status/priority **names** and convert the indicator to a labeled, individually-removable chip.

**Blocker condition.** None — a future UX-refinement candidate, not a deficiency.

**Recommended discharge.** When bookmark/share usage signals surface as real operator behavior.

**Refs.** `9e-manifest.md §6`; `02-decisions.md §E`; `10-known-limitations.md §A`; 9e.4 turn.

---

## CF-9f.1 — `isJobStalled` is not covered by the analytics harness

**What.** The retained `scripts/check-analytics-readers.ts` harness runs **23 assertions across the 9 readers** that existed at the end of 9d.6. The **`isJobStalled`** reader added at 9f (the 10th analytics reader) is verified by 9f's **cross-surface consistency check** (the job-detail badge agrees with the dashboard queue, 5/5 sample cases) but is **not yet covered by standing harness assertions**.

**Obligation (harness completeness).** Extend the harness to assert `isJobStalled` against fixture-known stalled-vs-non-stalled jobs (and a terminal-status job → null), completing analytics regression coverage to all 10 readers.

**Blocker condition.** None — **low priority**. The 9f cross-surface consistency check is the *load-bearing* correctness verification (`isJobStalled` shares the exact predicate + query with `countStalledJobs`); harness extension is regression-coverage *completeness*, not correctness.

**Recommended discharge.** When `scripts/check-analytics-readers.ts` / the fixture is next edited (likely a Phase 14/15 analytics extension), add the `isJobStalled` assertions in the same change.

**Refs.** `10-known-limitations.md §A`; 9f commit (`3966c4a`); `scripts/check-analytics-readers.ts`.

---

## Phase-8 carry-forwards touched by Phase 9 (treatment notes — not new entries)

The definitive entries remain in Phase 8's ledger. Phase 9 records its contribution for traceability; it neither opened nor re-owns these.

### CF-8b.1 — fresh-migration verify → **RE-AFFIRMED & EXTENDED through `0024`**

CF-8b.1 was **discharged at `v0.9.0-phase-8`** (a from-scratch `0000→0023` replay reproduced the live schema; recorded in the Phase-8 tag annotation). Phase 9's **9b.3.3 fresh-replay** into the empty sandbox extended that from-scratch proof through the new migration **`0024`** (sandbox post-replay matched production on `jobs` index count, 16 = 16, + cross-table parity). **Phase 8's entry stays discharged**; Phase 9 only extended the proof's coverage one migration further. **Ref.** `9b-schema-manifest.md §6`.

### CF-8c.8.3 — no test framework → **PARTIAL ANSWER (remains open)**

Phase 9's retained `scripts/check-analytics-readers.ts` (built 9d.6, fixture-derived oracle, 23 assertions) is the project's **first standing regression artifact** — but it is **analytics-specific**, not a general test runner / CI. **CF-8c.8.3 remains OPEN** in Phase 8's ledger; Phase 9 contributed a partial answer that future test-framework work can build on or supersede. **Refs.** `9d-manifest.md §7`; `10-known-limitations.md §C`; `scripts/check-analytics-readers.ts`.

---

## Untouched Phase-8 carry-forwards (completeness summary)

These remain **OPEN and unchanged** in the authoritative Phase-8 ledger (`docs/phase-8-billing-proposals/closeout-carryforwards.md`); Phase 9 did not address any (all are Phase-8-billing-specific, out of Phase 9 scope):

`CF-8c.1.1` (NTE-rule archive billing event) · `CF-8c.4.1` (multi-currency NTE override comparison) · `CF-8c.6.1` (`change_order_approvals.decision` enum alignment) · `CF-8c.8.1` (runtime role-gate integration test) · `CF-8c.8.2` (client-invoice draft discard writer) · `CF-8c.9.1` (overpayment reconciliation) · `CF-8c.docs.1` (`emergency_nte_multiplier` schema-present but inert) · `CF-8c.docs.2` (dispute-resolution / `under_review` transition writer).

`CF-8c.7.1` (job-margin reader) was already **RESOLVED** at 8c.8. For the authoritative state of every Phase-8 CF — including any tracked outside that ledger (e.g. `CF-8c.11d.1`, referenced in Phase-8's `10`/`11`) — see Phase 8's `closeout-carryforwards.md` + `11-closeout.md`; this is a one-line summary, not a re-statement.
