# Phase 10 — Vendor Portal MVP · Known Limitations

What Phase 10 deliberately does NOT do, and the bounded edges of what it does. Each is a conscious decision, not an oversight.

**CF/FB vs not:** deferrals where the platform owes a closure carry an **FB handle** and live definitively in `closeout-carryforwards.md` (this doc cross-references). Standing watchpoints (correct-but-bounded edges) are noted without a handle.

## A. Phase-10-originated limitations (with FB handle)

1. **No operator-side vendor-activity inbox.** Operators review vendor updates through the existing job-detail surfaces (status timeline, notes section with origin tag, AP invoice ladder) — there is no single "vendor updates" pane. — `FB-10a.3`.
2. **No real file upload.** Photos are metadata-only `job_attachments` rows with NULL `file_url`. — `FB-10a.4` (deferred indefinitely).
3. **No operator visibility-promotion** for vendor notes/attachments. The codebase has no post-creation visibility-update action; a vendor's `internal_only` note can be *seen* (origin-tagged) but not *promoted* to client-visible. — `FB-10l.2` (`DoR-10l.1`).
4. **No NTE-increase request flow.** A vendor cannot ask for an NTE bump (roadmap §2.3 lists it; §8 does not). — `FB-10a.5a`.
5. **No vendor quote submission.** — `FB-10a.5b`.
6. **No decline-after-accept.** Decline is only from `SENT`; once `ACCEPTED` there is no vendor back-out. — `FB-10k.1`.
7. **No SCHEDULED→SCHEDULED ETA revision.** A vendor cannot revise the ETA after confirming the schedule. — `FB-10k.3`.
8. **No cross-assignment context on shared jobs.** A vendor sees only their own assignment, not the job's other assignments. — `FB-10k.5`.
9. **Invoice route is assignment-scoped** (`/vendor/jobs/[id]/invoices/new`), a documented deviation from roadmap §8's `/vendor/invoices/new`. — `DoR-10n.1` (permanent design-of-record, not a CF).
10. **Harness is destructive + seed-dependent.** `check-vendor-predicates.ts` writes rows (acceptDispatch, placeholder, invoice smokes); re-running requires a re-seed first. — `FB-10k.4` (full per-transition coverage); `04-admin-sop.md §5`.

## B. Standing watchpoints (no FB)

- **`requires_review` note visibility is undefined codebase-wide.** The enum value exists; no workflow consumes it. Out of Phase 10 scope (operator concern). — noted as `FB-10l.3` for traceability only.
- **Seed fixture name lag.** `scripts/seed-sandbox-phase9*` now seeds Phase-10 data too; rename to a phase-9+10 name is deferred for stability. — `FB-10p.1`.
- **`tenants.type='vendor'` is vestigial.** Present in the enum, unused by Phase 10. Cleanup is `FB-10b.1`; do not infer from the enum value that vendors should be tenants (`DoR-10b.1`).
- **Dual-role users default to the aggregator portal.** An operator+vendor user lands on `/dashboard`; vendor portal entry is by direct nav. — `FB-10i.1`.

## C. Inherited carry-forwards (still open / unchanged)

These pre-date Phase 10 and are **not renumbered**; Phase 10 did not own them:

- **Phase 9:** `CF-9d.6.1` (dispatch-timing seed coverage gap), `CF-9e.4.1` (count-vs-chip `/jobs` filter indicator), `CF-9f.1` (`isJobStalled` not in the analytics harness) — all OPEN.
- **Phase 8:** `CF-8b.1` (fresh-migration verify) — **extended** through `0026` by Phase 10's migration cadence; stays discharged. `CF-8c.8.3` (no general test framework) — **partial**: Phase 10 adds a 61-assertion vendor-predicates harness alongside Phase 9's analytics harness; remains OPEN in Phase 8's ledger. The other eight Phase-8 CFs are billing-specific, untouched.
