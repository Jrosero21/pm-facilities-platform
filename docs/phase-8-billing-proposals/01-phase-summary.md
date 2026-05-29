# Phase 8 — Billing, Proposals, and Change Orders · Phase Summary

**Version:** `v0.9.0-phase-8` · **Branch:** `phase-8-billing-proposals` · **Roadmap:** §8

## What Phase 8 is

Phase 8 adds the platform's **billing substrate** — the financial records that hang off a job: what we propose to a client, how scope changes after the fact, what vendors bill us (AP), what we bill clients (AR), the payments against those invoices, and an explicit billing-close. It also adds the **not-to-exceed (NTE) ceiling** machinery: per-client rules that seed each job's NTE, and the detection that flags when vendor costs breach it.

It is a **substrate phase, not an automation phase.** Every financial decision is human-gated (operators approve vendor invoices; accounting issues client invoices, records payments, and closes billing). No agent runs in Phase 8 — the roadmap's "NTE negotiator" was explicitly deferred at the 8a design gate (OQ-27); the Phase-7 policy resolver (L-7.1) stays inert.

## What shipped

**Data layer (8c.1–8c.10)** — `src/server/billing/`:
- **NTE substrate** (`nte.ts`) — client NTE rules (client × trade × priority × optional location), a 4-rung resolver, lifecycle writers (create/activate/archive) with single-active enforcement.
- **Totals** (`totals.ts`) — the sole money-math writer per record: `big.js` decimal arithmetic, round-half-up explicit-mode, cost-basis + markup uplift (AR) / cost-only (AP).
- **Billing events** (`events.ts`) — `emitJobBillingEvent`, the single taxonomy-enforcement boundary; a 21-type event vocabulary (the job's financial timeline).
- **Five record types** — proposals (with revision chains), change-orders (forward deltas + computed-on-read effective NTE), vendor invoices (AP, with the exceeds-NTE arm + dual breach detection), client invoices (AR, with markup snapshot), payments (one table, XOR direction discriminator).
- **Billing close** (`close.ts`) — the dual-domain write to `CLOSED_BILLED` + the soft readiness advisory.
- **Helpers** — `money.ts` (shared line validators), `margin.ts` (`getJobMargin`), `role-gates.ts` (`isAccountingRole`).
- **createJob retrofit** — Phase-4 `createJob` became the sole writer of `jobs.not_to_exceed_amount` (resolves the NTE rule, snapshots it, audits operator overrides).

**UI (8c.11a–e)** — `src/components/` + `src/app/(app)/jobs/[id]/` + `src/app/(app)/clients/[id]/`:
- Job-detail billing section (margin, close-readiness, record counts) + a billing-event lane in the merged timeline.
- Navigable screens for all five record types (list + detail + create + line CRUD + lifecycle actions).
- Payments (XOR direction form), billing-close (confirm + readiness), NTE admin (per-client rules).

## The headline architecture

- **Single-writer per mutable substrate (R-7.2).** Totals, payment-status, billing-event emission, and `jobs.not_to_exceed_amount` each have exactly one canonical writer; nothing else writes them.
- **Two coexisting action-template kinds.** Operator CRUD is `requireTenant`-only (~31 wrappers); the four money actions — issue client invoice, void client invoice, record payment, close billing — go through `requireTenant + enforceAccountingGate(ctx)` (the platform's first enforced role gates, OQ-23/24). The gate policy is the pure `isAccountingRole` predicate, extracted once and reused.
- **Computed-on-read, not stored, where derivation is cheap and truth must not drift.** Effective NTE (base + approved COs), job margin (AR revenue − AP cost), close-readiness — all computed on read.
- **Money is `big.js` decimal strings end-to-end.** No floats touch a money value; the UI never does money math (the data layer is the arithmetic authority).
- **AR↔AP non-coupling.** The two invoice sides never import each other; they meet only in `margin.ts`. Payments touch exactly one side per call (the XOR).

## Cadence (how it was built)

Strict gated sub-batches. Schema gate (8b) applied 8 migrations before any construction. Each data-layer sub-batch (8c.1–8c.10) ran a **three-turn cadence** — pre-DB review (no code) → apply (typecheck + lint clean, no DB) → ephemeral verify script (run against the live DB, results captured, script deleted) — holding for review at every boundary. UI slices (8c.11a–e) ran a 2–3-turn cadence (manifest → build + static verify + mini-verify → commit). Every meaningful change got a billing-event and/or history row, never a bare state overwrite. See `8c-construction-plan.md` for the per-sub-batch locks and `11-closeout.md` for the commit ledger.

## Roadmap §8 acceptance — met

| Acceptance criterion | Where met |
|---|---|
| Vendor invoices separate from client invoices | Distinct tables + data layers (`vendor-invoices.ts` AP / `client-invoices.ts` AR); AR↔AP non-coupling enforced |
| A job can have multiple vendor invoices | `vendor_invoices` (no per-job uniqueness); `listVendorInvoicesForJob` |
| A job can have multiple client invoices | `client_invoices` (no per-job uniqueness); `listClientInvoicesForJob` |
| Proposals / change orders link to jobs | `proposals.job_id` + `change_orders.job_id` (NOT NULL); screens + lifecycle |
| Billing events tracked | `job_billing_events` + `emitJobBillingEvent`; 21-type taxonomy; the timeline lane |
| Phase docs updated | this 11-doc set |

"Do not build" honored: no full accounting system, no payment-processor integration (manual ledger only, OQ-18), only **simple** margin analytics (`getJobMargin` — revenue/cost/margin, OQ-16).

See: `02-decisions.md` (the locked calls + why), `05-system-workflows.md` (the end-to-end flows), `10-known-limitations.md` (the bounded scope), `11-closeout.md` (the ledger + tag steps).
