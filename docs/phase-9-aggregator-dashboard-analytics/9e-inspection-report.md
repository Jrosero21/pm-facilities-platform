# 9e.1 — Inspection sweep (dashboard composition + /jobs filter extension)

Read-only grounding for the 9e manifest. Factual; design choices deferred to 9e.2. Section numbers match the 9e.1 spec. Baseline: clean post-9d.7 (`tsc` 0 / `lint` 0 / tree clean).

---

## Section 1 — Existing UI conventions

### 1A. Server component pattern
Representative: `src/app/(app)/jobs/[id]/page.tsx` (the richest composition in the app).
- **Auth/tenant resolution** is the first statement: `const ctx = await requireTenant();` then `const tenantId = ctx.activeTenant.tenantId;` (`jobs/[id]/page.tsx:68-69`). Every `(app)/` page follows this (`jobs/page.tsx:6`, `dashboard/page.tsx:4`).
- **Readers are awaited directly in the server component**, batched in **`Promise.all([...])`** for parallelism. The job-detail page runs **two** parallel batches of 8 readers each (`:75-84`, `:87-96`), after a single guard read (`getJobDetail`, `notFound()` on null, `:71-72`).
- **Composition is inline in the page**: the page fetches all data and lays out sections; it delegates *presentational* chunks to components in `src/components/` (e.g. `<BillingSection …/>`, `<ProposalList …/>`). Interactive chunks (forms, action buttons) are separate client components. Pattern for the dashboard: `requireTenant` → `Promise.all` of the 9 analytics readers → inline role booleans → render sections (presentational components optional).

### 1B. Component organization
- `src/components/` is **flat** — ~45 files, no atoms/molecules/patterns subdivision; naming is domain-feature (`billing-section.tsx`, `proposal-list.tsx`, `dispatch-status-badge.tsx`).
- **Styling = Tailwind utility classes inline.** No CSS modules, no styled-components, no `src/styles`. `next.config.ts` is empty.
- Representative reusable patterns (full paths):
  - **Panel grid / metric card** — `src/components/billing-section.tsx` (a `grid gap-4 lg:grid-cols-3` of three `rounded-lg border border-neutral-200 bg-white p-4` cards).
  - **Semantic badge** — `src/components/dispatch-status-badge.tsx` and `src/components/confidence-badge.tsx` (`rounded px-2 py-0.5 text-xs font-medium ${categoryStyle}`).
  - **Table list** — inline in `src/app/(app)/jobs/page.tsx:26-60` (the only existing list-as-table; not yet extracted to a component).

### 1C. Page-level layout
`src/app/(app)/layout.tsx`:
- Calls `await requireAuth()` (auth, not tenant-required); renders an app shell: `<header>` with brand "PM Facilities" + active-tenant chip + user email + `<SignOutButton/>`, then a `<nav>` with links **Dashboard / Clients / Vendors / Jobs**.
- Content container: `<main className="mx-auto max-w-5xl px-6 py-8">{children}</main>`.
- **No sidebar.** Tenant/user context surfaces in the header only. The layout is a plain max-width container — it accommodates dashboard multi-section content with no change (sections stack inside `max-w-5xl`). *(Note: `max-w-5xl` is narrower than a typical analytics dashboard; whether 9e widens it for `/dashboard` is a manifest decision.)*

---

## Section 2 — Role-gating implementation

### 2A. Role data shape — **already on the context (no separate fetch needed)**
`requireTenant()` (`src/server/auth-context.ts:117`) returns `TenantAuthContext = AuthContext & { activeTenant: TenantMembership }`, where `AuthContext` (`:24-32`) is:
```
{ user:{id,email,name}, sessionId, memberships: TenantMembership[],
  activeTenant: TenantMembership|null, roleKeys: string[], isSuperAdmin: boolean }
```
`roleKeys` is computed (`:83-89`) as **global roles ∪ active-tenant roles** for the user, de-duped. So per-section role-gating predicates can consume `ctx.roleKeys` + `ctx.isSuperAdmin` **directly** — no `readUserRolesForTenant()` call required. (The Phase-1 stub already prints `ctx.roleKeys.join(", ")`.)

### 2B. Existing role-gating patterns
- **Whole-page redirect gate:** `requireRole(...allowed)` (`auth-context.ts:128`) — `super_admin` auto-passes, else `roleKeys.some(k => allowed.includes(k))`, redirect `/forbidden` on miss.
- **Action gate:** `enforceAccountingGate(ctx)` (`:143`) — redirect `/forbidden` if not accounting/super_admin; delegates to the pure predicate `isAccountingRole(roleKeys, isSuperAdmin)` in `src/server/billing/role-gates.ts:13`.
- **Read-side section-visibility precedent (the model for 9e):** `jobs/[id]/page.tsx:101` does `const canAccount = isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin);` then conditionally renders (passes `canAccount` into `<CloseBillingButton>`). So the established read-side idiom is **pure predicate → inline boolean → conditional render** (NOT redirect — redirect is wrong for hiding a section). There is **no generic multi-role read predicate** yet (only the billing-specific `isAccountingRole`). **9e establishes a small generic read-side predicate** (e.g. a `hasAnyRole(ctx, roles[])` mirroring `isAccountingRole`); form is a manifest decision.

### 2C. Roles inventory (live sandbox; identical global rows in prod)
`roles` columns are **`id, key, label, scope, description, …`** — **the gating key is `key`; the display name is `label`** (there is **no `code`/`name` column** — the spec's `SELECT code, name` would error). Six rows:

| key | label | scope |
|---|---|---|
| `super_admin` | Super Admin | global |
| `tenant_admin` | Tenant Admin | tenant |
| `operator` | Operator | tenant |
| `accounting` | Accounting | tenant |
| `vendor_user` | Vendor User | tenant |
| `client_user` | Client User | tenant |

---

## Section 3 — /jobs current state

### 3A. Current implementation
`src/app/(app)/jobs/page.tsx`: `requireTenant()` → `listJobs(ctx.activeTenant.tenantId)` → renders a table (Job # / Client / Location / Status / Priority / Created) with an inline empty-state. **No `searchParams` prop, no filters, no pagination.**

`listJobs(tenantId)` (`src/server/jobs.ts:53-71`): **single `tenantId` parameter — no filter params.** Selects display labels via joins (clients, client_locations, job_statuses INNER; priorities LEFT), `WHERE tenant_id = ? AND is_archived = false`, `ORDER BY created_at DESC`. No pagination (explicit carry-forward, `:51`).

### 3B. Cleanest extension path
`listJobs` does **not** accept filters today → the clean change is **additive optional params**, e.g. `listJobs(tenantId, filters?: { statusId?: string; priorityId?: string })`, conditionally appending `eq(jobs.currentStatusId, …)` / `eq(jobs.priorityId, …)` to the existing `and(...)`. No signature break for the current call site (filters defaults to none). No schema change.

### 3C. Open-population consistency — **confirmed**
`listJobs` already constrains `is_archived = false` (`jobs.ts:69`), matching the current-state "open" definition the dashboard cards use (9c manifest §9). A status-filtered `/jobs?status=` view will share that `is_archived=false` base, so a status card's count and the linked filtered list will agree (the 9c.4 R1 consistency argument holds). *(Note: `listJobs` includes terminal statuses if a card ever links to one; the open-status cards link only to non-terminal statuses, so within those links counts match.)*

---

## Section 4 — Refresh cadence + interactivity

### 4A. Revalidation patterns
- **`revalidatePath()`** is used throughout Phase-8 server actions (`clients/actions.ts:46`, `clients/contact-actions.ts:43,71`, `clients/[id]/nte-rules/actions.ts:79,93`, billing actions, etc.) — the post-mutation refresh idiom.
- **No tab-focus / window-focus revalidation** anywhere — no `router.refresh()`, no `useRouter`, no focus-listener client component. If 9e wants "soft refresh on tab focus" (9a §4) it is **greenfield** (a small client component calling `router.refresh()` on `window` focus). Manifest decision whether to include it in 9e or defer.

### 4B. Caching / route-segment config
- **No `export const dynamic` / `revalidate` / `fetchCache` anywhere** in `src/app/`. `next.config.ts` is empty.
- All `(app)/` pages call `requireTenant()` → reads `cookies()`/`headers()`, which **forces dynamic rendering** already (Next opts the route out of static). So the dashboard's live counts are not at risk of static caching by default. Pinning `export const dynamic = "force-dynamic"` on `/dashboard` would be belt-and-suspenders/intent-signalling — a manifest call, not a correctness requirement.

---

## Section 5 — Empty-state + loading-state patterns

### 5A. Empty-state — **ad-hoc inline, no shared component**
The pattern is `list.length === 0 ? <placeholder> : <list>`, with the placeholder a muted paragraph: e.g. `jobs/page.tsx:21-24` → `<p className="mt-8 text-sm text-neutral-600">No jobs yet. …</p>`; `jobs/[id]/page.tsx` repeats this per section (`:236 assignments.length === 0`, `:301 notes.length === 0`, `:353 communications.length === 0`). **No `EmptyState`/`EmptyPanel` component exists.** 9e's "lights up as data flows" empty states either follow the ad-hoc idiom or 9e extracts the project's first shared `EmptyState` (manifest decision; the dashboard composes ~9 panels so a shared one may pay off).

### 5B. Loading-state — **none exists**
No `loading.tsx`, no `<Suspense>` boundaries, no skeleton components anywhere. Server pages block on their `Promise.all` and render when complete. The dashboard's 9 readers are individually cheap on seed-scale data; a loading strategy (Suspense/streaming or a `loading.tsx` skeleton) is greenfield and optional for 9e.

---

## Section 6 — Card / panel / table styling reference

### 6A. Visual conventions (extracted from §1B examples + the Phase-1 stub)
- **Card:** `rounded-lg border border-neutral-200 bg-white p-4`.
- **Card label:** `text-xs uppercase tracking-wide text-neutral-500`. **Value:** `text-sm font-medium text-neutral-900` (counts emphasized via `font-semibold`).
- **Panel grids:** `grid gap-4 sm:grid-cols-2` (stub) / `grid gap-4 lg:grid-cols-3` (BillingSection).
- **Page heading:** `text-2xl font-semibold tracking-tight`.
- **Semantic color encoding (project-wide invariant — `dispatch-status-badge.tsx:1-5` "Same palette everywhere — do not vary per page"):** `neutral` = draft/idle, `amber` = pending/needs-attention, `blue` = active/engaged, `green`/`emerald` = done/positive, `red` = terminated/negative. Money: `text-emerald-700` (positive) / `text-red-600` (negative). **This maps cleanly onto urgency tiers** (stalled→red, overdue→amber, unassigned-high-priority→blue, aged→neutral) and onto status/priority chips — the manifest should reuse it, not invent a new palette.

### 6B. List-row patterns for the queue
The only list-as-rows today is the `/jobs` **table** (`jobs/page.tsx`). The operational queue (job + urgency tier + dwell + counts) can either reuse that table idiom (thead/tbody, `hover:bg-neutral-50`, `divide-y divide-neutral-100`) with an added urgency-tier **badge** column (badge idiom from §6A), or get a bespoke list-row treatment. No existing queue/priority-list component to inherit — manifest decision.

### 6C. Two-metric split (AP/AR pending) — **pattern exists**
`billing-section.tsx:51-72` (the Margin card) is exactly a "split metric" panel: a card with `flex justify-between` rows (`Revenue (AR)` / `Cost (AP)` / `Margin`). The pending-invoice AP/AR split reuses this verbatim (two `flex justify-between` rows in one card).

---

## Section 7 — URL parameter handling

### 7A. searchParams reception — **no precedent in the app**
**Zero `searchParams` usage** across `src/app/`. The established async-prop convention (Next 15) is visible in the dynamic route: `jobs/[id]/page.tsx` takes `{ params }: { params: Promise<{ id: string }> }` and `await`s it (`:62-67`). The same shape applies to query params: `/jobs` would add `{ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }` and `await searchParams`. 9e **establishes** the searchParams pattern for the project.

### 7B. ID value type — **string**
Status and priority IDs are `varchar(36)` (9c.2 surprise #3 — entity IDs are strings, UUIDv7). URL param values are therefore plain string IDs passed straight into the reader's `eq(...)`. Straightforward; pinned.

### 7C. Validation — **no precedent**
No URL-param validation pattern exists (no searchParams used anywhere). 9e decides the graceful-fallthrough behavior for an invalid/foreign `status`/`priority` id: ignore (render unfiltered), or `notFound()`. Cleanest given the tenant-scoped reader: a bad id simply yields zero matched rows (the `eq` matches nothing) — but to avoid a confusing "empty because typo" view, the manifest may validate the id against the tenant's status/priority set first. Manifest decision.

---

## Section 8 — Baseline check
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → **exit 0**.
- Working tree **clean** (post-9d.7, `08b77f1`).
- Sandbox intact (no drift): seed tenant `019e7573-4e29-70e7-84c5-d3d4ea134dcd`; **35 jobs**; open-by-status NEW 5 / SCHEDULED 4 / DISPATCHED 4 / IN_PROGRESS 4 / ON_HOLD 2 (**19 open**) — matches manifest §5. No re-seed needed for 9e construction.

---

## Surprises
1. **The auth context already carries `roleKeys` + `isSuperAdmin`** — the 9e.1 spec anticipated possibly needing a separate role fetch; there is none. Role-gating is a pure read off `ctx`.
2. **`roles` columns are `key`/`label`, not `code`/`name`** — the Section 2C query as written errors; the gating identifier is `key`.
3. **No loading-state infrastructure at all** (no `loading.tsx`/Suspense/skeletons) — greenfield for 9e.
4. **`listJobs` has zero filter parameters** — the extension is a clean additive optional-param change, no schema change, current call site unaffected.
5. **The Phase-1 dashboard stub is structurally reusable as scaffold** — it already uses `requireTenant()`, `ctx.roleKeys`, and the exact card idiom (`rounded-lg border … p-4` in a `grid`). 9e replaces the *body* (the 4 context cards → the composed operational surface) but keeps the page's pattern and styling vocabulary.
