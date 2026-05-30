# Phase 9 — Aggregator Dashboard & Analytics MVP · API Routes / Server Actions

Phase 9 adds **no new server actions** and **no new API endpoints** — it is read-heavy, and the analytics readers (`src/server/analytics/*`) are consumed **directly by server components**, not behind actions. Three existing routes change behavior; all are `(app)/` server components guarded by `requireTenant()` (which redirects unauthenticated → `/login`, no-tenant → `/no-tenant`).

## Route changes

| Route | Method | Phase 9 change |
|---|---|---|
| `/dashboard` | GET | **REPLACED** — Phase-1 stub → composed operational surface (9 role-gated panels) |
| `/jobs` | GET | **EXTENDED** — async `searchParams: { status?, priority? }` filter; `is_archived=false` base preserved |
| `/jobs/[id]` | GET | **EXTENDED** — additive "Stalled" aging badge in the job header |

## `/dashboard`

Composes the 10 analytics readers into 9 panels (see `01-phase-summary.md` / `02-decisions.md §E`). Role-gating via `src/server/role-predicates.ts`:
- `showOps = canSeeOperations(ctx)` (`tenant_admin | operator | super_admin`) gates panels 1–8 (stalled summary, operational queue, status cards, priority cards, top clients, top trades, time-in-status, time-to-dispatch).
- `showFin = canSeeFinancials(ctx)` (`accounting | tenant_admin | super_admin`) gates panel 9 (pending invoices) — the **read-vs-write asymmetry** (`02-decisions.md §E`; the financial *read* extends to `tenant_admin`, while billing *actions* stay strictly `accounting`).
- Readers are fetched in a single `Promise.all`, **conditional on the gates** (a non-financial user's payload never includes financial figures).
- **No-visible-section fallback:** a user passing neither gate (e.g. a lone `vendor_user`/`client_user`) sees a single `EmptyState` ("No dashboard panels are available for your role yet.").
- Rendering is **dynamic** (the `cookies()` read in `requireTenant()` opts the route out of static caching — no explicit `force-dynamic` needed); a route-level `loading.tsx` provides the navigation affordance.

## `/jobs`

- Receives **async `searchParams: Promise<{ status?: string; priority?: string }>`** (the Next.js 15 convention — Phase 9 is the codebase's first adoption). `await`ed, then passed through `resolveJobsFilters(tenantId, params)`.
- `resolveJobsFilters` **validates** each id against the tenant's status / priority vocabulary and **drops invalid/foreign ids** — a stale or hand-edited url yields an *unfiltered dimension*, never a 404 (graceful fallthrough). Valid ids feed `listJobs(tenantId, { statusId?, priorityId? })`, which is additive over the preserved `is_archived=false` base (so a status card's count and the linked filtered list agree).
- An **active-filter indicator** ("Showing N filtered jobs · Clear filters") renders when any filter is applied. Predicate definitions ("open," status/priority semantics) are authoritative in `06-business-rules.md`.

## `/jobs/[id]`

- Adds `isJobStalled(tenantId, jobId)` to the existing parallel fetch batch (no added round-trip). The header renders a red **"Stalled"** badge iff `aging?.isStalled === true`.
- `isJobStalled` returns **null** for a missing job, a cross-tenant id (tenant-scoped — defends against URL id-tampering, **no information leak**), or a **terminal-status** job (no aging callout on closed work) → no badge. Classification is **identical** to the dashboard queue (the paired aggregate+single-row reader pattern, `02-decisions.md §F`).

Index names referenced by these reads are authoritative in `08-db-changes.md`.
