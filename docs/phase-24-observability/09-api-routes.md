# Phase 24 — API / Server Surface

## New: `/agents` page (read-only, ops-gated)

`src/app/(app)/agents/page.tsx` — an **async server component** (no `"use client"`), in the
`(app)` route group, linked from the top nav (after "Review"). It is **read-only**: it
composes the seven observability readers in a single `Promise.all` and renders numeric cards
+ tables. A route-level `loading.tsx` provides the pending affordance.

- **Gating: page layer.** `requireTenant()` → `canSeeOperations(ctx)`; a non-ops role gets an
  early `<EmptyState>` ("not available for your role"). **No new role predicate** (reuses
  `canSeeOperations`, the dashboard convention). The readers themselves enforce **tenant
  scoping only** (`where tenant_id = ?`); the permission gate lives at the page, not in the
  readers.
- Errors bubble (Phase-8 convention — no try/catch in the page).

## No new mutating routes

Phase 24 added **no** HTTP routes, server actions, or mutations beyond the read-only page. The
observability readers are server-side functions (`"server-only"`), invoked only by the
server-component page. The retention cleanup and the failover/provider logic are **not**
HTTP-exposed — retention runs via the `pnpm db:retention:agent-payloads` script (CLI), and
failover runs inside the existing agent call path (no new entry point).

## Server-side modules added/changed (not routes)

| Module | Role |
|---|---|
| `src/server/analytics/agent-observability.ts` | 7 read-only observability readers (tenant-scoped). |
| `src/server/agents/config/pricing.ts` | model→price map + `priceFor` (pure util). |
| `src/server/agents/providers.ts` | provider registry + availability/parse/build helpers. |
| `src/server/agents/failover.ts` | candidate-builder + retry predicate + `runWithFailover`. |
| `src/server/agents/retention.ts` | shared retention eligibility predicate + counter. |
| `src/server/agents/llm-routing.ts` | `direct` mode provider-parameterized (B1). |
| `update-rewriter/llm.ts`, `scope-generator/llm.ts` (+ their `index.ts`) | call the failover loop; thread `failoverOrder` from policy. |

All are server-side; none are client-reachable except via the `/agents` server component.
