# 9e Manifest — Dashboard composition + /jobs filter extension

Authoritative reference for 9e's UI composition, the /jobs filter contract, the role-gating predicate set, the color/tier mapping, and the sub-batch order. Grounded in `9e-inspection-report.md`. Six pre-manifest dispositions (resolved by the user) are folded in; one (loading-state) resolved to **(b)**.

---

## Section 1 — Scope statement

9e builds, against the live 9c reader layer, the **aggregator operational dashboard** (`/dashboard`, replacing the Phase-1 stub) and the **`/jobs` filter extension** (`?status=` / `?priority=`) so dashboard cards link through to filtered inventory.

**In scope:** single composed `/dashboard` surface; the 9 analytics panels (queue, status cards, priority cards, stalled summary, top clients, top trades, time-in-status, time-to-dispatch, pending invoices); per-section role-gating; `listJobs` filter params + `/jobs` searchParams plumbing; shared `EmptyState` primitive; generic `hasAnyRole` predicate + named dashboard predicates; tier/category color constants; a route-level `loading.tsx`.

**Explicit NON-scope:** job-detail aging badge (**9f**); phase docs (**9g**); vendor/client portals, external integrations, AI chatbot (future phases); real-time/websocket updates (page-load + optional tab-focus soft refresh only); materialized views / caching beyond the readers.

**Decision:** locked.

---

## Section 2 — Layout architecture

Single composed server component at `src/app/(app)/dashboard/page.tsx`, replacing the stub. Pattern (per inspection §1A): `requireTenant()` → resolve `tenantId` + role booleans → **one `Promise.all` batch of the (visible) readers** → render role-gated sections top-to-bottom inside the existing `(app)/layout.tsx` `<main>` container. No new layout/shell; no sidebar.

**Section ordering (operator-first scan):**
1. **Needs-attention strip** — Stalled-jobs summary (total + per-status breakdown). The "what's on fire" header.
2. **Operational queue** — top-20 composite-urgency list (the headline working surface).
3. **Open pipeline** — Status cards row, then Priority cards row (link through to `/jobs?status=` / `?priority=`).
4. **Distribution** — Top clients + Top trades (side-by-side tables); Time-in-status + Time-to-dispatch (percentile cards).
5. **Financial** (role-gated) — Pending invoices AP/AR split.

**Role-gated visibility:** each section renders only if its named predicate (§5) passes. A user for whom **no** section is visible (e.g. a lone `vendor_user`/`client_user` — external roles whose portals are future phases) sees a single friendly fallback empty state ("No dashboard panels are available for your role yet."). Width: keep `max-w-5xl` from the layout for 9e (a wider analytics width is a future refinement, not 9e scope).

**Decision:** locked. Section order above is the pinned vertical sequence.

---

## Section 3 — Section inventory (THE review surface)

**Nine panels** (rows 1–9 below; matches the §2 section order — Stalled summary and Operational queue are counted as two distinct panels). Each: reader(s) consumed · role predicate (§5) · empty-state · link-through. All readers take `(tenantId)` (queue + top-N take an extra limit). All counts are current-state `is_archived=false` except the two distributions (historical, per 9c §9).

**Job aging** is communicated *implicitly* — through the stalled summary (1), the operational queue's dwell ordering (2), the time-in-status distributions (7), and the time-to-dispatch distributions (8). There is **no dedicated aging panel** in 9e; the per-job aging *callout* (the job-detail aging badge) is **9f**.

| # | Panel | Reader(s) | Predicate | Empty-state | Link-through |
|---|-------|-----------|-----------|-------------|--------------|
| 1 | **Stalled summary** | `countStalledJobs` → `{total, byStatus[]}` | `canSeeOperations` | total 0 → `EmptyState "No stalled jobs — everything's within SLA."` | (none in 9e; tier rows are informational) |
| 2 | **Operational queue** | `operationalQueue(tid, 20)` → `QueueEntry[]` | `canSeeOperations` | `[]` → `EmptyState "No open jobs in the queue."` | each row → `/jobs/{id}` (job detail) |
| 3 | **Status cards** | `countOpenJobsByStatus` (0-count rows incl) | `canSeeOperations` | reader returns the full non-terminal vocabulary; if all 0, cards still render (0 is informative) — no empty-state | each card → `/jobs?status={statusId}` |
| 4 | **Priority cards** | `countOpenJobsByPriority` (0-count rows incl) | `canSeeOperations` | as above (full tenant priority set; 0s shown) | each card → `/jobs?priority={priorityId}` |
| 5 | **Top clients** | `topClientsByOpenJobs(tid, 5)` | `canSeeOperations` | `[]` → `EmptyState "No open jobs to rank by client."` | (none in 9e — client drill-through is future) |
| 6 | **Top trades** | `topTradesByOpenJobs(tid, 5)` | `canSeeOperations` | `[]` → `EmptyState "No open jobs to rank by trade."` | (none in 9e) |
| 7 | **Time-in-status** | `timeInStatusDistribution` → per-status p50/p90/mean | `canSeeOperations` | `[]` → `EmptyState "Not enough completed transitions yet — this lights up as jobs move through statuses."` | (none) |
| 8 | **Time-to-dispatch** | `timeToDispatchDistribution` → `{count,p50,p90,mean}` | `canSeeOperations` | `count===0` → `EmptyState "No dispatched jobs yet — dispatch timing appears once vendors are assigned."` | (none) |
| 9 | **Pending invoices** | `countPendingInvoices` → `{vendorPending, clientPending, total}` | `canSeeFinancials` ⚑ | always renders (0/0/0 valid); two `flex justify-between` rows (AP / AR) | (none in 9e; → AP/AR list is future) |

Rendering notes: queue rows carry an **urgency-tier badge** (§4 color); status cards carry a **category color** accent (§4); the stalled summary and queue both use the shared `isStalled`/tier classification already in the readers (no UI re-derivation). **As-built (9e.6):** the queue section heading carries its row count ("Operational queue · {N} jobs") for scan-symmetry with the stalled summary's prominent count (panel 1's heading renders as "Needs attention"; panel 2's as "Operational queue · N jobs"). The "lights up as data flows" framing (scope item 8 / aging) is realized by panels 1/2/7/8's empty-states + the queue's per-row dwell — there is **no separate "aging" panel** in 9e (the job-detail aging badge is 9f).

**Panel-9 gating — RESOLVED:** `canSeeFinancials` = **`accounting` + `tenant_admin` (+ super_admin)**. Dashboard *read* of pending-count summaries extends to the tenant admin for oversight; the billing *actions* stay strictly `accounting`-gated (`isAccountingRole`). This is the **read-vs-write role-gating asymmetry** principle (§11 → `02-decisions.md`): a read-side summary panel may extend visibility beyond the corresponding write-side gate when the information is summary-level and management-relevant (3 count numbers — no invoice content, customer data, or documents). Mirroring the write gate (segregation of accounting *duties*) onto the read side would be a category error: the write-gate's concern (preventing accidental financial mutations) doesn't apply to a read.

**Decision:** locked.

---

## Section 4 — Color encoding ("do not vary per page" — hard constraint)

Reuses the existing project palette verbatim (`dispatch-status-badge.tsx`: neutral/amber/blue/green/red). A single constants module `src/server/analytics/` is NOT the home (it's pure UI) — these live in a new **`src/components/dashboard/tier-colors.ts`** (pure constant maps + a tiny class helper), imported by the queue + status/category renderers so the mapping has one source of truth.

**Urgency-tier → color** (pinned by disposition 1):

| tier | color slot | badge classes |
|------|-----------|---------------|
| `stalled` | red | `bg-red-100 text-red-700` |
| `overdue` | amber | `bg-amber-100 text-amber-800` |
| `unassigned-high-priority` | amber | `bg-amber-100 text-amber-800` |
| `aged` | neutral | `bg-neutral-100 text-neutral-700` |

**Status-category → color** (categories from live `job_statuses.category`; rolled onto existing slots, aligned with the dispatch-badge semantics):

| category | statuses | color slot | accent classes |
|----------|----------|-----------|----------------|
| `open` | NEW, SCHEDULED | neutral | `bg-neutral-100 text-neutral-700` |
| `in_progress` | DISPATCHED, IN_PROGRESS | blue | `bg-blue-100 text-blue-800` |
| `on_hold` | ON_HOLD | amber | `bg-amber-100 text-amber-800` |
| `completed` | COMPLETED, CLOSED, CLOSED_BILLED | green | `bg-green-100 text-green-800` |
| `cancelled` | CANCELLED | red | `bg-red-100 text-red-700` |

Status cards show only the non-terminal categories (open/in_progress/on_hold); the terminal rows are pinned for completeness + reuse. **Priority cards are NOT color-encoded** (color is reserved for urgency tiers + status categories; priority is conveyed by label + rank order) — avoids palette dilution.

**Priority cards vs. queue tiers (not contradictory):** priority cards communicate **count and rank position**; the operational queue communicates **urgency**, which *incorporates* priority rank into its tier classification (e.g. an unassigned high-priority job becomes the `unassigned-high-priority` tier). Color is reserved for the queue's urgency dimension and the status categories; priority itself uses rank position and count emphasis, not color.

**Decision:** locked (tier map per disposition 1; category map pinned here).

---

## Section 5 — Role-gating primitives

Generic primitive + composed named predicates (disposition 2, option (c) "both"). Pure module (mirrors `billing/role-gates.ts` shape), **`src/server/role-predicates.ts`** (server-root, generic; not under `billing/`; flat file since `src/server/auth.ts` exists and a sibling `auth/` dir would collide).

```ts
type RoleCtx = { roleKeys: string[]; isSuperAdmin: boolean };
// super_admin always passes (mirrors requireRole / isAccountingRole).
export function hasAnyRole(ctx: RoleCtx, allowed: string[]): boolean {
  return ctx.isSuperAdmin || ctx.roleKeys.some((k) => allowed.includes(k));
}
// Named dashboard predicates compose over hasAnyRole (call-site readability):
export const canSeeOperations = (ctx: RoleCtx) => hasAnyRole(ctx, ["tenant_admin", "operator"]);
export const canSeeFinancials = (ctx: RoleCtx) => hasAnyRole(ctx, ["accounting", "tenant_admin"]); // read-vs-write asymmetry (§3)
```
- Input type is the narrowed `RoleCtx` (mirrors `enforceAccountingGate`'s `Pick<…>`); the full `TenantAuthContext` is structurally compatible at call sites. Keeps the module pure (no `server-only`, no `AuthContext` import) → unit-testable.
- Roles use **`key`** (not `code`); `label` is display-only (inspection §2C). Predicates match on `key`.
- Section→predicate mapping is pinned in §3.

**Decision:** locked. `canSeeFinancials` includes `tenant_admin` (read-vs-write asymmetry, §3).

---

## Section 6 — /jobs filter extension contract

**Reader signature change** (additive; current call site unaffected):
```ts
export async function listJobs(
  tenantId: string,
  filters?: { statusId?: string; priorityId?: string },
): Promise<JobListItem[]>
```
Conditionally append `eq(jobs.currentStatusId, filters.statusId)` and/or `eq(jobs.priorityId, filters.priorityId)` to the existing `and(eq(tenantId), eq(isArchived,false))`. No schema change; `is_archived=false` base preserved (inspection §3C consistency).

**Route plumbing** (`src/app/(app)/jobs/page.tsx`):
```ts
export default async function JobsPage(
  { searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }
) {
  const ctx = await requireTenant();
  const sp = await searchParams;               // async per Next 15 (inspection §7A; 9e establishes this)
  const { statusId, priorityId } = await resolveJobsFilters(ctx.activeTenant.tenantId, sp);
  const jobs = await listJobs(ctx.activeTenant.tenantId, { statusId, priorityId });
  …
}
```

**Validation (graceful fallthrough):** `resolveJobsFilters` validates each provided id against the tenant's status vocabulary (`job_statuses`, global) / priority set (`priorities` where tenant). **Invalid/foreign id → that filter is dropped** (render unfiltered for that dimension), never a 404 — dashboard links are always valid; manual/stale URLs degrade gracefully. The active, valid filters render as a small removable indicator ("Status: In Progress ✕" linking back to `/jobs`), plus the result count. IDs are `varchar(36)` strings (inspection §7B) passed straight into `eq`.

**Four-combination verification plan** (against the seeded sandbox, expected from the §5 fixture):

| URL | filter | expected rows |
|-----|--------|---------------|
| `/jobs` | none | all non-archived (35) |
| `/jobs?status={NEW.id}` | status NEW | 5 |
| `/jobs?priority={ROUTINE.id}` | priority ROUTINE | 9 (open ROUTINE; closed jobs carry null priority) |
| `/jobs?status={NEW.id}&priority={ROUTINE.id}` | NEW ∧ ROUTINE | 2 (`n2`, `n5`) |

Plus an invalid-id case (`?status=not-a-real-id` → unfiltered 35, no error).

**Filter-indicator form (resolved 9e.4):** implemented as **count + Clear-filters**, not the labeled chip sketched above. The illustrative chip ("Status: In Progress ✕") was a visual sketch; the count form honors the pinned `resolveJobsFilters` signature (IDs only, no name resolution) and avoids two extra label-lookup SELECTs per request. Operators arrive via a dashboard card click (they know which filter they applied) — they need the active-filter signal + an escape hatch, not a re-statement. If bookmark/URL-share workflows later surface a need for label visibility, future iteration extends `resolveJobsFilters` to return names — banked as a future UX refinement.

**Decision:** locked. Sub-batch 9e.4 (testable in isolation).

---

## Section 7 — Shared EmptyState component

First shared UI primitive of this kind (disposition 6: establish). Matches the existing ad-hoc markup exactly (inspection §5A): a muted paragraph.

- **Location:** `src/components/empty-state.tsx` (kebab-case file, PascalCase export — the project convention, inspection pre-draft #1; **not** `EmptyState.tsx`).
- **Signature:** `export function EmptyState({ message, className }: { message: string; className?: string })` → `<p className={\`text-sm text-neutral-600 ${className ?? ""}\`}>{message}</p>`.
- **Usage:** `<EmptyState message="No open jobs in the queue." />`; caller supplies margin via `className` (e.g. `mt-3`) to match the surrounding section, consistent with the current inline idiom.
- ~6 lines; server-compatible (no client directive). Used 9× in 9e; inheritable for Phase 10/11 portals (which will likely add richer portal-specific empty-states — noted as a §11 forward-bank).

**Decision:** locked.

---

## Section 8 — Loading-state decision

**Resolved → (b):** a single route-level `src/app/(app)/dashboard/loading.tsx` (Next wraps the async page in Suspense automatically). Minimal skeleton/affordance reusing the card idiom (a few muted placeholder cards). **No per-panel Suspense, no streaming** — the 9 readers are millisecond-cheap at current/foreseeable volume; (c) is unearned complexity. **No `export const dynamic`** needed — `requireTenant()`'s `cookies()` read already forces dynamic rendering (inspection §4B), so live counts are never statically cached.

Banked as a **future-scale watchpoint** (§11): refine to per-panel Suspense + skeletons (option (c)) only when reader latency under real volume warrants it — alongside the `job_status_history` index-deferral watchpoint.

**Decision:** locked (b).

---

## Section 9 — Implementation notes

- **Stub replacement:** keep the page's pattern (`requireTenant` + card idiom + `roleKeys`) from the Phase-1 stub; replace the 4 context cards with the composed sections. The stub's `grid gap-4` + `rounded-lg border … p-4` vocabulary carries straight over.
- **Reader composition:** resolve role booleans first, then build a single `Promise.all` of **only the readers whose section is visible** (don't fetch financial data for a user who can't see it). Acceptable to over-fetch all 9 for MVP simplicity if cleaner — but prefer gated fetch (cheap correctness + avoids leaking financial figures into the payload of a non-financial user).
- **Data-blocked / empty rendering:** every panel renders its `EmptyState` (or 0-count cards) rather than disappearing — the "lights up as data flows" contract (design proposal §5/§7). Distribution panels (7/8) and stalled/queue (1/2) are the ones most likely empty on a fresh tenant.
- **Presentational components:** extract per-panel server components under `src/components/dashboard/` (e.g. `operational-queue-panel.tsx`, `status-cards.tsx`, `pending-invoices-panel.tsx`) following the `BillingSection` precedent — page composes, components present. Final granularity decided in 9e.5.
- **No new color/empty/role patterns invented** beyond §4/§5/§7.

**Decision:** locked.

---

## Section 10 — Sub-batch breakdown

- **9e.3 — Shared primitives.** `src/server/role-predicates.ts` (`hasAnyRole` + `canSeeOperations` + `canSeeFinancials`); `src/components/empty-state.tsx`; `src/components/dashboard/tier-colors.ts` (tier + category color maps + class helper); `src/app/(app)/dashboard/loading.tsx`. No page wiring yet. tsc+lint; report.
- **9e.4 — /jobs filter extension.** `listJobs` signature + `resolveJobsFilters` validator + `jobs/page.tsx` searchParams plumbing + active-filter indicator. Run the four-combination + invalid-id verification against the seeded sandbox. Report the count table.
- **9e.5 — Dashboard composition.** Replace the stub; build the 9 panels in the §2 section order with §3 gating + §4 colors; extract `src/components/dashboard/*` panels. Iterative against the seeded sandbox. Report.
- **9e.6 — Final integration verify.** `pnpm db:check:analytics-readers` (still 23/23); manually visit `/dashboard` + the four `/jobs` filter URLs at the seeded sandbox; verify each tier/section/empty-state renders correctly; capture screenshots if useful for closeout. Report.
- **9e.7 — Commit.** Single commit: primitives + filter extension + dashboard + manifest + inspection report. Report SHA/chain/tree.

**Decision:** locked order. 9e.3 → 9e.4 are independent of 9e.5 and could be verified before composition begins.

---

## Section 11 — Closeout forward-notes

- `04-admin-sop.md`: how to develop UI against the seeded sandbox — the **`DATABASE_URL` inline-override** is the canonical sandbox-targeting pattern and applies **uniformly** to `db:migrate`, `db:check:analytics-readers`, **and `npm run dev`** (verified 9e.6). Full dev form (password never typed; inline env wins over `.env.local` via Next's env precedence): `DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')" npm run dev`, then log in as a seed user (`admin@phase9seed.test` / `Phase9-Seed-Pw!`, tenant_admin → all panels). The seed is re-runnable (`scripts/seed-sandbox-phase9.ts`); `pnpm db:check:analytics-readers` validates reader state before/after UI work.
- `10-known-limitations.md`: **loading-state** is route-level only (option b) — a future-scale watchpoint; refine to per-panel Suspense (c) when reader latency warrants (banked beside the `job_status_history` index deferral). **EmptyState** is established but minimal; Phase 10/11 portals will add richer portal-specific empty-states.
- `02-decisions.md`: the six 9e dispositions — styling-inheritance (palette is a hard "no per-page variation" constraint), role-gating (c) both-primitive-and-named, additive `listJobs` filter, async `searchParams` convention established, implicit-dynamic-via-cookies (no `force-dynamic`), `EmptyState` establishment, loading-state (b).
- `02-decisions.md` — **read-vs-write role-gating asymmetry (foundational principle, established 9e).** Verbatim: *"Phase 9 establishes read-vs-write role-gating asymmetry. Read-side dashboard panels can extend visibility beyond the corresponding write-side action's role gate when the information is summary-level and management-context-relevant. Action gates remain strict; read gates are calibrated to operator-management-team mental model."* Concrete instance: `canSeeFinancials` (read) = accounting | tenant_admin | super_admin, while billing actions (`enforceAccountingGate`/`isAccountingRole`, write) = accounting | super_admin. Mirroring a write gate (which exists for segregation of accounting *duties* / preventing accidental mutations) onto the read side is a category error.
- `06-business-rules.md`: the **urgency-tier→color** and **status-category→color** mappings (§4) — presentation rules, but consequential for operator-mental-model consistency; the "same palette everywhere" invariant is a stated rule.
- `06-business-rules.md` (or a UX-notes section) — **count-in-heading pattern** (emerged 9e.6 manual pass): list/table section headings should include a row count to give scanning operators an immediate quantitative anchor, parallel to Panel 1's prominent "N stalled jobs". Discovered when the queue's missing count caused brief disorientation (Jonny expected "(19)" as a visual anchor and couldn't immediately locate Panel 2). Applied as "Operational queue · {N} jobs"; future list/table surfaces (portals, reports) should follow.
- `02-decisions.md` — **9e.3 shared primitives established (inheritable by Phase 10/11 portals).** `src/server/role-predicates.ts` is the project's first general **read-side** role primitive (`hasAnyRole` + named predicates) — distinct from the write-side `enforceAccountingGate`. `src/components/empty-state.tsx` is the first shared empty-state component (consolidates the ad-hoc bare-`<p>` idiom). `src/app/(app)/dashboard/loading.tsx` is the project's first **route-level loading affordance** (option (b)); future routes template off it. `src/components/dashboard/tier-colors.ts` keys its tier map as `Record<UrgencyTier, …>` so adding a tier to `stalled-rules` forces a compile error until its color is assigned (structural color-coverage enforcement).

---

## Section 12 — Pre-draft inspection findings (folded into the body)

- **Component naming = kebab-case file + PascalCase named export** → `EmptyState` lives at `empty-state.tsx` (§7), not `EmptyState.tsx`.
- **No `loading.tsx` anywhere** (confirmed) → 9e.3 establishes the project's first (§8).
- **Phase-8 empty-state markup** = bare `<p className="text-sm text-neutral-600">…</p>`, margin from caller → `EmptyState` signature matches exactly (§7), no card wrapper/background.
- **`job_statuses.category` vocabulary** = open / in_progress / on_hold (non-terminal) + completed / cancelled (terminal) → pinned the §4 category→color map.
