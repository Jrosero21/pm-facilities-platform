# Phase 12 — External Client Portal Integration Framework — Opening Handoff

**From:** Phase 11 closeout (`v1.2.0-phase-11`) · **To:** the Phase 12 build chat · **Date:** 2026-05-30

This document is the parting artifact of Phase 11 and the opening brief for Phase 12. Read it first, then `docs/roadmap/01-gpt-project-roadmap.md` §8 (Phase 12 row) + §2.1 (the source-agnostic invariant), then `docs/phase-11-client-portal/` for the patterns Phase 12 inherits.

## Three-party workflow (unchanged)

- **Jonny** — human executor-operator: runs commands, applies migrations, confirms gates, owns prod.
- **strategic-partner chat** (the planner) — designs the phase, issues verbatim paste-back specs with halt-gates.
- **Claude Code** (executor) — inspects, proposes, applies in small batches, verifies, summarizes; halts at every gate.

## Source-of-truth order

user instruction → roadmap → live repo → live DB → current-phase docs → older-phase docs.

## Phase 11 close summary (where we are)

Phase 11 shipped the **Client Portal MVP** and tagged **`v1.2.0-phase-11`** at commit **`0aea00a`** (main is live there; fast-forward, linear history). The 12-commit range `c85bef3..0aea00a`:

`633bb2c` (handoff) → `5f21666` (11a/11b inspection+decisions) → `6c3724b` (migration 0027 client_users) → `ea243a7` (auth substrate) → `a760e59` (11d route group + list) → `caf081d` (11e detail) → `68b6670` (11f submission) → `7da9090` (11g note write) → `5745aef` (11h locations) → `0bd5467` (11i invoices + proposal accept) → `e5c9d3b` (11p-A harness) → `0aea00a` (11p-B1 docs).

**Delivered:**
- **6 client surfaces** — `/client/jobs`, `/client/jobs/[id]`, `/client/jobs/new`, `/client/locations`, `/client/invoices`, + `/client-no-access`; proposals as a section on job detail.
- **2 scope-pinned write paths** — `createClientJob` (job submission) + `createClientNote` (updates); plus `acceptClientProposal` (the proposal-accept write).
- **Substrate** — `client_users` table (migration **0027**), the lean `vendor_users` twin; `getClientScope`/`requireClient`/`isClientUser` auth triad; `origin='client'` on `job_notes` (no migration — varchar); `source_type='internal_client_portal'` on `jobs` (existing enum value, pinned by the submission path).
- **OQ-6 margin protection** — client invoice + proposal readers expose the marked-up **total only**, never subtotal/markup/line items.
- **`getClientJobDetail` is the single source of isolation truth** — the detail page, note reader/writer, and proposal reader/accept all route their scope check through it.
- **Empirical close:** `scripts/check-client-portal.ts` — **57/57 green** at `e5c9d3b`, discharging SI-11d.1 (read + direct-URL isolation), SI-11f.1 (submission write isolation), SI-11g.1 (note write isolation), SI-11i.1 (proposal-accept isolation), OQ-6 shape, and the `isClientUser` routing-predicate smoke. Phase was gated on this harness being green before any tag/push/merge.

Production: migration **0027** applied + verified (prod migration count 28); main's code now matches prod schema. No other prod writes.

## What Phase 12 must deliver (roadmap §8 Phase 12 row; target `v1.3.0-phase-12`)

A **generic external-portal integration framework** — the deepest exercise yet of the source-agnostic invariant. Where Phase 10/11 wired *internal* vendor/client portals, Phase 12 maps **external** work orders INTO the same `jobs` substrate via a generic adapter, with **ServiceChannel as the FIRST adapter — not hardcoded into the core** (roadmap §2.1: "the app is source-agnostic; ServiceChannel is one channel among many").

**Anticipated core tables** (confirm exact shape in 12a/12b — do not author from this list):
- `external_systems` — the registered integrations (per tenant).
- `external_accounts` / `external_credentials` — per-tenant connection identity + secrets (credential handling is a security crux — inspect how the platform stores secrets today before designing).
- `external_work_order_links` — the mapping of an external WO id ↔ our `jobs.id` (the join that keeps us source-agnostic).
- `external_status_mappings` / `external_priority_mappings` / `external_trade_mappings` — translate the external vocabulary into our global/tenant reference data.
- `external_sync_runs` / `external_sync_events` / `external_payload_logs` — sync orchestration + full payload auditability (the "every meaningful workflow gets a history/event row" principle, applied to ingestion).

**Anticipated code shape:**
- `src/lib/integrations/` — a **core + adapter** folder pattern: the core orchestrates sync/mapping/linking generically; each provider is an adapter implementing a shared interface. ServiceChannel is the first adapter **skeleton**, registered into the core, never referenced by the core directly.
- A new `jobs.source_type='external_client_portal'` flow (mirroring how `internal_client_portal` was pinned in 11f) — external WOs land as ordinary `jobs` rows, entering the operator queue, distinguished only by `source_type` + the `external_work_order_links` row.

**Acceptance criteria (per roadmap §8):** a generic framework + ONE working adapter skeleton + the mapping/sync/log substrate, with external WOs correctly ingesting into `jobs` and round-tripping status. **Do NOT:** build all providers, build an email parser, or build full bidirectional automation — those are later phases.

## Phase 12 character

Heavy on **mapping tables + sync/payload logging** (auditability principle) and on **keeping the core provider-agnostic** (the architectural hard rule). The win condition is that adding a *second* provider later requires only a new adapter, with zero core changes. Treat credential storage and inbound-payload trust as security cr-uxes (inspect-before-design, like 11f's scope-pin).

## Key inheritances

Phase 12 inherits the full pattern stack: the **Phase 9 seven** + **Phase 10 ten** project patterns, the foundational principles (source-agnostic; browser never touches MySQL; AI output is a reviewable draft; every workflow gets a history/event row; small inspect→propose→apply→verify batches), the migration cadence (drizzle entry → generate → SQL inspect halt → sandbox apply → contract-verify → HALT for prod confirm → prod apply → 4-file commit), the harness discipline (destructive + seed-dependent, pattern 10), and the **§10 buffering-glitch discipline** (file-capture, never blind-re-run, verify by authoritative ref/journal). Phase 12 **adds the integration-adapter pattern** (core + per-provider adapter behind a shared interface) to that stack.

## Phase 11 carry-forwards into Phase 12

Canonical list: `docs/phase-11-client-portal/closeout-carryforwards.md`. Summary:
- **New (CF-11.x, open):** CF-11.1 client-side proposal reject · CF-11.2 priority picker on submission · CF-11.3 `/client/invoices/[id]` + OQ-6-safe line detail · CF-11.4 full-HTTP routing smoke (predicate-level discharged) · CF-11.5 multi-client client-user fixture.
- **Inherited (roll forward):** FB-10a.1 (operator vendor- AND now client-updates inbox) · FB-10a.3 (vendor/client invite flow) · FB-10l.2 (visibility-promotion, still operator-manual) · FB-10l.3 (`requires_review` undefined) · FB-10b.1 (`tenants.type` enum — and whether to add `'client'`/`'external'`) · **FB-10p.1 (seed fixture rename — now seeds phases 9+10+11; a natural Phase-12 boundary task)**.
- **Standing watchpoints:** `job_status_history` index growth · TZ-skew discipline (DB-clock intervals in seeds) · route-level `loading.tsx` only · better-auth NULL-tenant audit rows.

## First step

Phase 12 opens with the **12a inspection sweep** (mirroring 11a/10a, read-only): survey `jobs.source_type` for any external value(s) already in the enum; any existing integration scaffolding (`src/lib/integrations/`?), webhook/route endpoints, or credential-storage substrate; how secrets are stored today; the reference tables external mappings would target (`job_statuses`, `priorities`, `trades`); and the adapter-substrate gap. Then 12b locks the schema + fork decisions. **No code until 12a + 12b are reviewed.**

(This is a condensed opening handoff; the full Phase 11 record is in `docs/phase-11-client-portal/` — start with `11-closeout.md`.)
