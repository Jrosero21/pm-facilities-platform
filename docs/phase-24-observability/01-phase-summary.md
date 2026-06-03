# Phase 24 — Phase Summary

## Goal

Build the **§2.3 readiness-evidence layer** for autonomy: agent **observability**
(track A), **multi-provider + failover** (track B), and **token-logging retention**
(track C). Phase 23 shipped the autonomy policy engine + guardrails but deliberately left
the live trigger unwired ("permission ≠ readiness"). Phase 24 builds the surface that lets
an operator *see* how the agents behave — approve-as-is rates, volume, failures, cost,
dispositions, latency — so autonomy can later be enabled on **evidence**, not faith. It also
hardens the LLM path (provider failover so autonomy doesn't stall on one provider's outage)
and ages out heavy logging payloads.

## What shipped

- **Track A — Observability data layer + page.** Seven compute-on-read readers
  (`src/server/analytics/agent-observability.ts`) + a dedicated **`/agents`** operator page
  (own route, ops-gated). Cost is computed on read from a `config/pricing.ts` model→price map.
- **Track C — Retention.** A 180-day, NULL-not-delete, idempotent, prod-capable cleanup
  script for the heavy longtext payloads, keyed on a DB-side age predicate; the eligibility
  counter is shared (`src/server/agents/retention.ts`).
- **Track B — Multi-provider + failover.** A providers-as-data registry
  (`src/server/agents/providers.ts`), the OpenAI direct-SDK path (dormant until a key is
  set), and a failover loop (`src/server/agents/failover.ts`) that retries transport errors
  only and reads an ordered provider preference from `agent_policies` JSON.
- **Harness.** `scripts/check-phase-24.ts` (`db:check:observability`) — 28/0 green,
  proving the readers, the failover candidate-builder + predicate, and the retention counter.

## Scope statement

**This is a READ + CODE phase. NO schema changes, NO migration, 0047 UNTOUCHED.** Provider
preference reuses the existing `agent_policies` JSON column (data, not DDL); cost reuses the
existing `agent_runs.model`/token columns; observability and retention read/clear existing
tables only. The build landed across a 7-commit stack: `72662c5` (readers), `e093464`
(page), `78b14d7` (retention script), `67ca11e` (provider registry + OpenAI path), `435441f`
(CF-24.1 fix), `c66b82a` (failover loop), `d9d49bc` (harness + retention extraction).

## What did NOT ship (deliberately)

The **live autonomy trigger** — `autoDispatchDraftForJob` is still invoked by nothing in app
code. Phase 24 built the evidence the §2.3 gate requires; flipping the trigger is a discrete
future decision now tracked as **CF-24.2**. OpenAI is **built but dormant** (no key) — real
failover is proven by logic, not live traffic, until a key is added.
