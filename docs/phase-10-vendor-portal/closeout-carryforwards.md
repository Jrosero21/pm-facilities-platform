# Phase 10 — Vendor Portal MVP · Carry-Forwards

Items carried forward at the `v1.1.0-phase-10` close. This ledger records **Phase 10-originated** carry-forwards (the `FB-…` banks) plus a treatment note for the inherited Phase-8/9 carry-forwards Phase 10 touched. Distinct from standing non-CF watchpoints in `10-known-limitations.md §B`.

**Handle convention:** `FB-<sub-batch>.<seq>` (banked items surfaced during a sub-batch).
**Status legend:** **Open** (tracked for a future phase) · **Discharged** (resolved during Phase 10) · **Deferred indefinitely** (out of scope, no current owner).

---

## FB-10a.1 (Open) — Vendor user invite flow
**What.** No admin-side flow to create a vendor user + map to a vendor + grant the `vendor_user` role; the seed does it manually and MVP assumes operators create vendor users directly. **Obligation.** An invite/onboarding UI. **Discharge.** Operator-portal phase or Phase 10.5. **Refs.** `10a-design-proposal §11`; `01-phase-summary`.

## FB-10a.2 (Open) — Branded vendor login page
**What.** MVP shares `/login` with role-routed redirect (`Fork 2`); no branded `/vendor/login`. **Obligation.** A vendor-facing login entry if onboarding needs it. **Discharge.** When vendor onboarding/marketing surfaces a need. **Refs.** `02-decisions §A Fork 2`.

## FB-10a.3 (Open) — Operator vendor-updates inbox
**What.** No single operator pane aggregating vendor updates; review happens through existing job-detail surfaces (`Workflow 10`). **Obligation.** A dedicated "vendor updates" inbox. **Discharge.** Operator-portal phase. **Refs.** `10-known-limitations §A.1`.

## FB-10a.4 (Deferred indefinitely) — Real photo upload backend
**What.** Photos are metadata-only `job_attachments` rows with NULL `file_url` (`Fork 7`). **Obligation.** Storage provider + signed URLs + validation; backfill `file_url`/size/mime on existing placeholder rows. **Blocker.** None — a deliberate MVP scope cut. **Discharge.** A dedicated file-upload-infra phase. **Refs.** `06-business-rules §9`; `10-known-limitations §A.2`.

## FB-10a.5a (Deferred) — NTE-increase request flow
**What.** Vendor cannot request an NTE bump (roadmap §2.3 lists it; §8 does not). Substrate question open: typed `dispatch_messages` variant vs a new `nte_change_requests` table. **Discharge.** Phase 10.5 or 11. **Refs.** `10b-decisions-locked §3 FB-10a.5a`.

## FB-10a.5b (Deferred) — Vendor quote submission
**What.** Vendor cannot submit a quote (would write the Phase 8 `proposals` substrate, status=draft). **Discharge.** Phase 10.5 or 11.5 slice. **Refs.** `10b-decisions-locked §3 FB-10a.5b`.

## FB-10a.6 (Open) — Vendor invoice draft state
**What.** Invoices land `received`; there is no pre-submit `draft` state (not a live `vendor_invoices.status` value). **Obligation.** Add a `draft` status + staging UI if operators want vendors to stage invoices. **Discharge.** When demand surfaces. **Refs.** `02-decisions §A Fork 8`.

## FB-10a.7 (Open) — Vendor-scoped analytics readers
**What.** No vendor-facing analytics (vendor performance, on-time rate). **Obligation.** Vendor-scoped readers extending the Phase 9 analytics pattern (+ harness, per the co-versioning contract). **Discharge.** A vendor-analytics phase. **Refs.** `10b-decisions-locked §3`.

## FB-10b.1 (Open) — `tenants.type='vendor'` enum cleanup
**What.** The enum value is vestigial/unused (`DoR-10b.1`). **Obligation.** Schema-hygiene removal (or repurpose). **Blocker.** None — leaving it is harmless; removing it is a low-priority migration. **Discharge.** A schema-hygiene pass. **Refs.** `02-decisions §B DoR-10b.1`.

## FB-10g.1 (Open) — `canSubmitVendorInvoice` status tightening
**What.** The predicate stays loose (no status gate, `DoR-10n.2`); it mirrors `canActOnAssignment`. **Obligation.** If a business rule emerges ("invoice only after WORK_COMPLETE"), tighten it (a one-function edit — the predicate is named separately for exactly this). **Discharge.** Operator-workflow phase. **Refs.** `06-business-rules §3`.

## FB-10g.2 (Discharged at 10j) — Impure-harness seed extension
**What.** At 10g the `getVendorScope` harness assertions were structural-only (`vendor_users` empty). **Discharged:** 10j seeded the vendor user + mapping and added fixture-derived `getVendorScope` + list-reader assertions. **Refs.** `1f3986a`; `scripts/check-vendor-predicates.ts`.

## FB-10i.1 (Open) — Explicit vendor-portal switcher for dual-role users
**What.** A user with both operator-class and `vendor_user` roles defaults to `/dashboard`; vendor entry is by direct nav. **Obligation.** A portal switcher in the shared chrome. **Discharge.** When dual-role users are real. **Refs.** `02-decisions §A Fork 2`; `10-known-limitations §B`.

## FB-10j.1 (Open) — Backfill aggregator `/jobs/loading.tsx`
**What.** The vendor list/detail have `loading.tsx`; the aggregator `/jobs` list still has none (parity gap noticed at 10j). **Obligation.** Add `(app)/jobs/loading.tsx` for parity. **Blocker.** None — cosmetic. **Discharge.** When the aggregator jobs list is next touched. **Refs.** `1f3986a`.

## FB-10j.2 (Partially discharged at 10k) — Seed `sent_at`-NULL-at-ACCEPTED quirk
**What.** The seed created ACCEPTED assignments with `sent_at` NULL (a real flow would set `sent_at` at SENT). **Partial:** 10k's seed extension sets `sent_at` on the one converted SENT assignment; the other ACCEPTED rows still carry NULL `sent_at`. **Obligation.** Backfill `sent_at` for the operator-side seeded ACCEPTED assignments if the seed is used to exercise operator dispatch flows. **Refs.** `dd0c54b`; `04-admin-sop §3`.

## FB-10k.1 (Open) — Decline-after-accept
**What.** Decline is only from `SENT`; no vendor back-out once `ACCEPTED`. **Obligation.** A decline/withdraw transition from later states (with operator notification). **Discharge.** When real vendor back-out needs surface. **Refs.** `06-business-rules §4`; `10-known-limitations §A.6`.

## FB-10k.3 (Open) — SCHEDULED→SCHEDULED ETA revision
**What.** A vendor cannot revise the ETA after confirming the schedule. **Obligation.** Allow an ETA-update transition appending a new `vendor_eta_confirmations` row without a status change (the table is append-only by design). **Discharge.** When ETA-revision demand surfaces. **Refs.** `10-known-limitations §A.7`.

## FB-10k.4 (Open) — Full per-transition harness coverage
**What.** The harness write-smokes `acceptDispatch` (+ the photo/invoice writes); `declineDispatch`/`confirmEta`/`confirmSchedule`/`markOnSite`/`markWorkComplete` are not individually exercised (a seed-reset-between-tests pattern is needed for the full lifecycle). **Obligation.** Per-transition coverage with seed resets. **Discharge.** When the harness is next extended (10.5 / a future dispatch change). **Refs.** `04-admin-sop §5`; `scripts/check-vendor-predicates.ts`.

## FB-10k.5 (Open) — Cross-assignment context on shared jobs
**What.** A vendor sees only their own assignment, not the job's other assignments. **Obligation.** A (carefully scoped) read of co-vendor presence on a shared job, if ever wanted. **Blocker.** Privacy — must not leak other vendors' rates/notes. **Discharge.** Deferred; likely never for the vendor portal. **Refs.** `10-known-limitations §A.8`.

## FB-10l.2 (Open) — Operator note/attachment visibility-promotion
**What.** No post-creation visibility-update action exists; operators can see but not promote a vendor's `internal_only` note/photo to client/vendor-visible (`DoR-10l.1`). Scope extended to attachments at 10m. **Obligation.** An operator-side visibility-change action + UI. **Discharge.** Operator-portal phase. **Refs.** `02-decisions §C.2`; `10-known-limitations §A.3`.

## FB-10l.3 (Open) — `requires_review` visibility workflow undefined
**What.** The `requires_review` note-visibility enum value exists codebase-wide but no workflow consumes it. **Obligation.** Define the review workflow (operator-side). **Blocker.** None — out of vendor-portal scope. **Discharge.** Operator-workflow phase. **Refs.** `10-known-limitations §B`.

## FB-10p.1 (Open) — Seed fixture rename
**What.** `scripts/seed-sandbox-phase9.ts` + `…-fixture.ts` now seed Phase-10 data too; the `phase9` name lags. **Obligation.** Rename to a phase-9+10 name (e.g. `seed-sandbox.ts`) at the next major phase boundary, updating all imports + `package.json`. **Blocker.** None — left as-is for stability (a rename touches many imports). **Discharge.** Next major phase boundary. **Refs.** `04-admin-sop §3`.

---

## Inherited carry-forwards touched by Phase 10 (treatment notes — not new entries)

The definitive entries remain in the earlier phases' ledgers.

### CF-8b.1 — fresh-migration verify → **RE-AFFIRMED & EXTENDED through `0026`**
Phase 10's migration cadence (`0025`, `0026`) ran the standing sandbox→prod additive-migration discipline; the `0026` populated-table apply re-affirmed CF-8b.1's "verify the schema mutation empirically" methodology one populated migration further (3 prod rows correctly backfilled). **Stays discharged** in Phase 8's ledger.

### CF-8c.8.3 — no test framework → **PARTIAL (remains open)**
Phase 10 adds `scripts/check-vendor-predicates.ts` (61 assertions, fixture-derived oracle, seed-dependent) — a second standing regression artifact alongside Phase 9's `check-analytics-readers.ts`. Still **not** a general test runner / CI. **Remains OPEN** in Phase 8's ledger; Phase 10 contributed a second domain-specific harness.

### Phase 9 CFs — UNCHANGED (still open)
`CF-9d.6.1` (dispatch-timing seed coverage), `CF-9e.4.1` (count-vs-chip filter), `CF-9f.1` (`isJobStalled` harness coverage) — Phase 10 did not touch these; they remain OPEN in Phase 9's ledger, listed here for completeness only.
