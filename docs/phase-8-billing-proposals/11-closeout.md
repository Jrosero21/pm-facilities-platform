# Phase 8 — Closeout

**Version:** `v0.9.0-phase-8` · **Branch:** `phase-8-billing-proposals` · **Construction HEAD:** `3133489`

## What Phase 8 delivered

The billing substrate (NTE rules + resolution, totals, the 21-type billing-event timeline, five record types — proposals, change-orders, vendor invoices AP, client invoices AR, payments — billing close, and per-job margin) plus the operator UI over it, with the platform's first enforced role gates (accounting). Human-gated throughout; no agent (OQ-27). See `01-phase-summary.md`.

## Commit ledger (f5a3736 → 3133489, on `phase-8-billing-proposals`)

| Commit | Sub-batch |
|---|---|
| `f5a3736` | 8a — lock design proposal (Surface 23 + 27 OQ resolutions) |
| `24b82dc` · `2475712` · `a725a79` | 8b — lock schema plan · apply migrations 0016–0023 + CLOSED_BILLED seed · track CF-8b.1 |
| `9106481` | 8c.1 NTE substrate |
| `f3cd5ae` | 8c.2 totals infrastructure |
| `ef2fa56` | 8c.3 billing events |
| `0fb0870` | 8c.4 createJob NTE integration |
| `5833e00` | 8c.5 proposal data layer |
| `eff2a0c` | 8c.6 change-order data layer |
| `40487c4` | 8c.7 vendor-invoice data layer (AP) |
| `5fc48d0` | 8c.8 client-invoice data layer (AR) + 1st accounting gate |
| `0111b5e` | 8c.9 payment data layer |
| `0dea91b` | 8c.10 billing-close data layer |
| `33b7d74` | 8c.11a billing section + merged timeline |
| `faaeae4` | 8c.11b proposal screens + action template |
| `ffbcbc8` | 8c.11c change-order screens |
| `102f48e` | 8c.11d invoice screens + role-gate extraction |
| `3133489` | 8c.11e payments + close + NTE admin (construction complete) |
| _(this commit)_ | closeout docs (11-doc set) |

## Gate cadence + verification

Data-layer sub-batches ran the **three-turn cadence** (pre-DB review → apply [typecheck+lint clean, no DB] → ephemeral verify script run against the live DB → results captured → script deleted). UI slices ran a 2–3-turn cadence (manifest → build + static [`tsc`/`lint`/`next build`] + mini-verify → commit). Every sub-batch held for review at each boundary.

Verify assertion counts: 8c.7 **85/85**, 8c.8 **86/86**, 8c.9 **79/79**, 8c.10 **64/64** (recorded in `8c-construction-plan.md` §5); UI mini-verifies 8c.11a **4/4**, 8c.11b **5/5**, 8c.11c **5/5**, 8c.11d **15/15**, 8c.11e **5/5** (recorded in the respective commit messages). Sub-batches 8c.1–8c.6 were each verified at their gate before commit; per-sub-batch assertion counts for those were not separately retained. Every UI slice closed with `next build` SUCCESS (all routes `ƒ` dynamic).

## Acceptance-criteria literal map (roadmap §8)

| §8 acceptance line | Status / where |
|---|---|
| Vendor invoices separate from client invoices | ✅ distinct tables + data layers; AR↔AP non-coupling (margin.ts the sole meeting point) |
| A job can have multiple vendor invoices | ✅ `vendor_invoices` no per-job uniqueness; `listVendorInvoicesForJob` |
| A job can have multiple client invoices | ✅ `client_invoices` no per-job uniqueness; `listClientInvoicesForJob` |
| Proposals/change orders can link to jobs | ✅ `proposals.job_id`, `change_orders.job_id` NOT NULL; screens + lifecycle |
| Billing events are tracked | ✅ `job_billing_events` + `emitJobBillingEvent`; 21 types; timeline lane |
| Phase docs updated | ✅ this 11-doc set |

Deliverables (vendor/client invoice record, multiple per job, basic proposal + change order, billing events, job billing section, phase docs) — all shipped. "Do not build" honored (no full accounting system; no payment-processor integration — manual ledger OQ-18; only simple margin — `getJobMargin` OQ-16).

## Structural guarantees — all held (empirically + structurally verified per sub-batch)

- **R-7.2 single-writers:** totals (`recalculate*Totals`), `payment_status` (`payments.ts`), billing-event emission (`emitJobBillingEvent`), `jobs.not_to_exceed_amount` (`createJob`) — each the sole writer of its column.
- **D-7.3 scope isolation:** no billing writer touches `job_scope_steps` / `approved_scope_of_work` (string-match + empirical, every sub-batch).
- **8c.4 NTE sole-writer:** no billing writer writes `jobs.not_to_exceed_amount`; the narrowed-guarantee flip at 8c.10 (billing-close writes `jobs.current_status_id`/`closed_at` but never the NTE column).
- **Phase-5 dispatch immutability:** AP never writes `job_vendor_assignments.agreed_nte_amount` (reads only).
- **AR↔AP non-coupling:** the invoice data layers never import each other; payments touch one side per call (the XOR); they meet only in `margin.ts`.
- **`totals.ts` cycle-free + event-free** after the 8c.7 arm graft.

## Carry-forwards ledger

**Resolved in-phase:**
- **CF-8c.7.1** — `getJobMargin` (deferred from 8c.7) shipped in `margin.ts` at 8c.8.
- **CF-8c.1.1** — NTE-rule lifecycle audit shipped at 8c.11e (`audit_logs` `client_nte_rule.{created,activated,archived}`).

**Open (tracked in `closeout-carryforwards.md` / `10-known-limitations.md`):** CF-8b.1 (the tag blocker, below), CF-8c.4.1 (multi-currency NTE comparison), CF-8c.6.1 (CO decision-enum vocab cleanup, optional), CF-8c.8.1 + CF-8c.8.3 (runtime role-gate integration test — needs a request-context harness; consolidated), CF-8c.9.1 (overpayment untracked), CF-8c.8.2 (client-invoice draft discard), CF-8c.11d.1 (vendor-invoice assignment-anchored), CF-8c.11d.2 (the lint tidy, below), CF-8c.docs.1 (`emergency_nte_multiplier` schema-present but Phase-8-inert — resolver wiring deferred), CF-8c.docs.2 (no dispute-resolution / `under_review`-transition writer — disputed is terminal in Phase 8).

## Remaining steps to the tag

1. **CF-8c.11d.2** — one-line lint tidy: remove the unused `text` import in `src/server/schema/client-invoices.ts`.
2. **CF-8b.1 (TAG BLOCKER)** — run the full from-scratch migration rebuild (`0000`→`0023`) against a scratch/throwaway DB and confirm the schema is byte-identical to the worked-DB schema (the Phase-7-precedent verification). If it diverges, that blocks the tag — investigate before tagging.
3. **Tag `v0.9.0-phase-8`**, fast-forward `main` to the closeout commit (the convention: `main` tracks each phase closeout), push, then open a fresh `phase-9-<name>` branch (the step-11 rule).

_(The **closeout-commit hash**, the **CF-8b.1 fresh-migration result**, and the **tag confirmation** are recorded in the `v0.9.0-phase-8` **tag annotation** — the immutable record — rather than self-referenced in this doc, which ships inside the closeout commit.)_
