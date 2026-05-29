# Phase 9 — 9c.1 Inspection Report (analytics reader layer)

**Phase:** 9 — Aggregator Dashboard & Analytics MVP
**Sub-batch:** 9c.1 — inspection sweep grounding the 9c manifest in actual Phase 8 patterns
**Branch:** `phase-9-aggregator-dashboard-analytics` · **HEAD:** `a648c52` (9b.6)
**Date:** 2026-05-28
**Status:** inspection facts only — no design opinions (those go in the 9c manifest, 9c.2).

> Capture: repo facts from direct inspection; DB facts from an ephemeral read-only `tsx` probe against `jonnyrosero_pm` (deleted post-capture). File-capture discipline used throughout.

---

## Section 1 — Phase 8 reader-layer pattern (the template)

**A. Directory layout.** `src/server/billing/` — **file-per-domain, no subdirectories**, 13 files: `proposals.ts`, `vendor-invoices.ts`, `client-invoices.ts`, `change-orders.ts`, `payments.ts`, `close.ts`, `nte.ts`, `events.ts`, `totals.ts`, `errors.ts`, `margin.ts`, `money.ts`, `role-gates.ts`. Readers + writers **coexist in the same domain file**; small pure helpers get their own files (`money.ts`, `totals.ts`, `role-gates.ts`, `errors.ts`). `margin.ts` (27 lines) is the precedent for a **tiny cross-domain aggregator reader** — directly relevant to analytics.

**B. Reader signature pattern.** Verbatim:
```ts
export async function getProposal(tenantId: string, id: string): Promise<ProposalRow | null> {
  const rows = await db.select().from(proposals)
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.id, id))).limit(1);
  return rows[0] ?? null;
}
export async function listProposalsForJob(tenantId: string, jobId: string): Promise<ProposalRow[]> {
  return db.select().from(proposals)
    .where(and(eq(proposals.tenantId, tenantId), eq(proposals.jobId, jobId)))
    .orderBy(asc(proposals.createdAt), asc(proposals.id));
}
export async function sumApprovedVendorInvoiceTotals(tenantId: string, jobId: string): Promise<string> { ... }
export async function getJobMargin(tenantId: string, jobId: string): Promise<{ revenue: string; cost: string; margin: string }> { ... }
export async function getBillingCloseReadiness(tenantId: string, jobId: string): Promise<{ ready: boolean; concerns: CloseConcern[] }> { ... }
```
Confirmed conventions:
- **Tenant scoping = explicit `tenantId: string` as the FIRST parameter, every reader.** Readers NEVER call `requireTenant()` internally. Filter is `and(eq(table.tenantId, tenantId), …)`.
- **All readers `async`.**
- **Bare `db` client** from `@/server/db` (drizzle mysql2), used directly. No wrapper.
- **Return shapes:** bare arrays (`ProposalRow[]`), row-or-null (`ProposalRow | null`), money as **decimal strings** (`Promise<string>`, never `number`), or inline/aliased structured objects (`{revenue,cost,margin}`, `{ready,concerns}`). Row types are `typeof table.$inferSelect`.

**C. Empty-state handling.** Convention: **never null-for-empty, never throw on empty.**
- List readers → `[]` (drizzle returns empty array).
- Sum/aggregate readers → computed `"0.00"` via a `sumTotals` helper seeded with `new Big(0)`.
- Structured checks → the struct with empty internals (`getBillingCloseReadiness` returns `{ ready: true, concerns: [] }` when nothing's outstanding).
- Single-row getters → `null` (the only null case, and it's "not found," not "empty aggregate").
This maps cleanly to the design proposal's "lights up as data flows" — data-blocked metrics return well-typed zeros/empties, not null/throw.

**D. Imports / module setup.** Every data-layer file opens with **`import "server-only";`** then drizzle ops, the `db` client, schema tables, intra-domain helpers. Verbatim head of `proposals.ts`:
```ts
import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { proposalApprovals, proposalLineItems, proposals } from "@/server/schema";
import { recalculateProposalTotals } from "@/server/billing/totals";
import { emitJobBillingEvent } from "@/server/billing/events";
...
export type ProposalRow = typeof proposals.$inferSelect;
```
No `"use server"` anywhere in the data layer. Row types re-exported inline as `$inferSelect`.

**E. Reader/writer & read-only discipline.** Readers and writers are **mixed in the same domain file, distinguished only by signature/intent** (writers take input objects, open `db.transaction()`, emit events, return `{id}`/`void`; readers take `(tenantId, …ids)` and query). There is **no separate `*-actions.ts` inside `src/server/billing/`** — the `"use server"` action layer lives under `src/app/(app)/**` (e.g. `jobs/billing-actions.ts`) and calls the data-layer readers/writers. **Implication for 9c:** since analytics is *all readers*, the analytics files are naturally "pure" — no writer/action mixing, no `"use server"`. Follow the billing file shape exactly (`import "server-only"`, `db`, explicit `tenantId`).

---

## Section 2 — History tables: read-path queries (indexes confirmed live)

**A. `job_status_history`** (for `timeInStatusDistribution`). Indexes: `PRIMARY(id)`, **`job_status_history_tenant_job_idx (tenant_id, job_id)`**, + single-col FK indexes (`job_id`, `from_status_id`, `to_status_id`, `changed_by_user_id`). **GOTCHA: there is NO `(tenant_id, job_id, created_at)` and NO `(job_id, created_at)` index** — unlike `job_events`/`job_billing_events`/`communication_logs` which all carry a `(…, created_at)` composite. Consecutive-row diffing (`ORDER BY created_at` within a job) filters on `(tenant_id, job_id)` then **filesorts by `created_at`** per job. Trivial at current volume; a real consideration at scale. **Flagged in §"would-have-been-9b".** Sample query shape:
```sql
SELECT job_id, to_status_id, created_at FROM job_status_history
WHERE tenant_id = ? ORDER BY job_id, created_at;   -- diff consecutive rows per job in app code
```

**B. `job_vendor_assignments` + `job_vendor_assignment_status_history`** (for `timeToDispatchDistribution`). `job_vendor_assignments` has **`jva_tenant_job_idx (tenant_id, job_id)`** and `jva_tenant_status_idx (tenant_id, current_status_id)`, but **no index on `created_at`**. "First assignment per job" = `MIN(created_at) GROUP BY job_id` filtered by `(tenant_id, job_id)` — the composite serves the filter+group; `created_at` is aggregated, not ranged, so no extra index needed. The status-history table keys on **`assignment_id`** (`jvash_tenant_assignment_idx (tenant_id, assignment_id)`) — join through `job_vendor_assignments` to reach `job_id` (confirmed; matches 9b.1). Sample:
```sql
SELECT job_id, MIN(created_at) AS first_assigned_at FROM job_vendor_assignments
WHERE tenant_id = ? GROUP BY job_id;
```

**C. `job_events`.** Columns: id, tenant_id, job_id, event_type (varchar 64), actor_user_id, summary, metadata(json), created_at. Indexes: **`job_events_job_created_idx (job_id, created_at)`**, `job_events_tenant_job_idx (tenant_id, job_id)`, FK index on actor. Note: there is **no `(tenant_id, event_type)`** index (cf. `job_billing_events` which has one). Sample "events of type X in tenant Y in window Z":
```sql
SELECT * FROM job_events WHERE tenant_id = ? AND event_type = ? AND created_at >= ? AND created_at < ?;
-- served by tenant_job_idx prefix (tenant_id); event_type + created_at filtered in-row.
```

**D. `job_billing_events`** (for AR/AP pending counts). `event_type` is **varchar(64), not an enum** — taxonomy lives in code, not the DB. Indexes: **`jbe_tenant_type_idx (tenant_id, event_type)`** (ideal for type-grouped tenant counts), `jbe_job_created_idx (job_id, created_at)`, `jbe_tenant_job_idx (tenant_id, job_id)`, + per-entity FK indexes (proposal/co/vendor_invoice/client_invoice/payment). **NB:** "invoice pending" is better derived from the invoice tables' `status` (§E) than from billing-event types — billing events are an append-only audit feed, not a current-state store (a `client_invoice.sent` event isn't negated by a later `payment.recorded`). The manifest should source pending-counts from §E, not here. (Live `job_billing_events` = 0 rows; taxonomy can't be enumerated from data.)

**E. `vendor_invoices` + `client_invoices`** (for `countPendingInvoices`). Both have **`(tenant_id, status)`** indexes (`vinv_tenant_status_idx`, `cinv_tenant_status_idx`) — ideal for tenant-wide pending counts. Live enums:
- `vendor_invoices.status` = **`received, under_review, approved, disputed, paid`**; separate `payment_status` = `unpaid, partially_paid, paid`. (AP "pending" candidates: `approved` + `payment_status != paid` = approved-but-unpaid; or `received`/`under_review` = not-yet-actioned. Manifest decides the exact predicate.)
- `client_invoices.status` = **`draft, sent, void`**; separate `payment_status` = `unpaid, partially_paid, paid`. (AR "pending" candidates: `status='sent'` AND `payment_status IN (unpaid, partially_paid)` = issued-but-unpaid. Note: there is **no `partially_paid` in `status`** — partial payment lives in `payment_status`, not `status`; the design proposal §7 sketch that said `status='partially_paid'` was slightly off. Use `payment_status` for paid-ness.)
Sample:
```sql
SELECT COUNT(*) FROM client_invoices WHERE tenant_id = ? AND status = 'sent' AND payment_status <> 'paid';
SELECT COUNT(*) FROM vendor_invoices WHERE tenant_id = ? AND status = 'approved' AND payment_status <> 'paid';
```

**F. `communication_logs`.** Columns include channel, direction, source_type/source_id, visibility, delivery_status, sent_at, delivered_at, read_at, created_at. Rich index set: `cl_tenant_job_created_idx (tenant_id, job_id, created_at)`, `cl_tenant_status_idx (tenant_id, delivery_status)`, `cl_tenant_channel_idx (tenant_id, channel)`, `cl_tenant_recipient_idx`, `cl_source_idx`. Well-indexed for any tenant-scoped comms-velocity metric. The design proposal §8 did **not** list a communication metric; cataloged here so the manifest can decide whether to surface anything (e.g. drafts-never-sent count via `(tenant_id, delivery_status)`). Not in current §8 scope.

---

## Section 3 — Reference tables: tenant scoping

**A. `priorities` — TENANT-SCOPED.** Columns: id, **tenant_id**, name, description, code, **rank (int)**, status, created_by_user_id, timestamps. Indexes: `priorities_tenant_idx (tenant_id)`, `priorities_tenant_code_unique (tenant_id, code)`, `priorities_tenant_name_unique (tenant_id, name)`, `priorities_status_idx (status)`. **No `(tenant_id, rank)` index.** `countOpenJobsByPriority` iterates per-tenant ordered by `rank` — filtered by `(tenant_id)` then sorts ~5 rows by rank in memory. **Negligible** (5 priorities/tenant); an index would be over-engineering. Flagged but **recommend NOT adding**.

**B. `job_statuses` — GLOBAL.** No `tenant_id`. Confirmed `category enum('open','in_progress','on_hold','completed','cancelled')` + **`is_terminal tinyint(1)`** + `sort_order` + `code` (unique). "Open" = `is_terminal = 0`. Indexes: code/name unique, `status_idx`. No hardcoded status codes needed in the reader layer.

**C. `trades` — GLOBAL.** Columns: id, name, code (unique), status, timestamps. No `tenant_id`. (`open jobs by trade` counts are tenant-scoped via the `jobs` filter; the trade label join is global.)

---

## Section 4 — Tenant-scoping helper

**A. Location:** `src/server/auth-context.ts`.
**B. Signatures:**
```ts
export async function requireTenant(): Promise<TenantAuthContext>   // redirect("/no-tenant") if no active tenant
export async function requireAuth(): Promise<AuthContext>           // redirect("/login") if unauthenticated
export async function requireRole(...allowed: string[]): Promise<AuthContext>  // redirect("/forbidden")
export function enforceAccountingGate(ctx: Pick<AuthContext,"roleKeys"|"isSuperAdmin">): void
```
`TenantAuthContext = AuthContext & { activeTenant: TenantMembership }`; `AuthContext` carries `user{id,email,name}`, `sessionId`, `memberships[]`, `activeTenant`, `roleKeys[]`, `isSuperAdmin`. The tenantId is `ctx.activeTenant.tenantId`.
**C/D. Consumption pattern:** `requireTenant()` is called **once at the server-action / page boundary** (it calls `redirect()`, so it belongs in request context, not deep in readers); the extracted `ctx.activeTenant.tenantId` is **passed down** to data-layer readers/writers as the explicit `tenantId` param. Verified call sites: `jobs/billing-actions.ts` (`const ctx = await requireTenant(); … recordPayment({ tenantId: ctx.activeTenant.tenantId, … })`) and the dashboard page (`const ctx = await requireTenant();`). **Implication for 9c:** analytics readers take **explicit `tenantId: string`** (mirroring billing); the `/dashboard` page (9e) calls `requireTenant()` once and passes `tenantId` into each analytics reader.

---

## Section 5 — Dashboard route surface

**A.** `src/app/(app)/dashboard/page.tsx` is a server component that calls **only `requireTenant()`** (no data readers) and renders an identity/tenant/roles `<dl>` + the "Phase 1 dashboard stub" note. Full file is the Phase-1 stub (≈40 lines).
**B.** **No `components/` subdir, no co-located action files** near the route. 9c readers are pure additions under `src/server/analytics/`; 9e wires them into this page (and likely adds `dashboard/components/` then).

---

## Section 6 — `/jobs` list query

**A.** `src/server/jobs.ts` → `listJobs(tenantId: string): Promise<JobListItem[]>`. Drizzle: `select({id, jobNumber, clientName, locationName, statusName, priorityName, createdAt})` from `jobs` `innerJoin` clients/clientLocations/jobStatuses, `leftJoin` priorities, `where(and(eq(jobs.tenantId, tenantId), eq(jobs.isArchived, false)))`, `orderBy(desc(jobs.createdAt))`.
**B.** **No pagination** (documented carry-forward), no cursor/offset/limit. Order: `createdAt DESC`. Tenant-scoped via `eq(jobs.tenantId, tenantId)`. `JobListItem` is a hand-written composed type (label-joined). **Pattern for `operationalQueue`:** same join+filter shape, but add `is_terminal=0` (open only), urgency ordering, and `LIMIT 20` — the queue reader can mirror `listJobs`'s join structure rather than reinvent it.

---

## Section 7 — TypeScript shapes and exports

**A.** No central row-type module. `src/types/` exists but is **empty** (`.gitkeep`). Row types are **co-located in schema files** as `export type X = typeof table.$inferSelect`. Domain/composed types are co-located with their readers.
**B.** Representative composed types:
- `JobListItem`, `JobDetail`, `JobSourceType` — `src/server/jobs.ts` (hand-written, label-joined).
- `ProposalRow`, `ClientInvoiceRow`, `VendorInvoiceRow` — `$inferSelect` in respective billing schema/reader files.
- Inline structured returns — `getJobMargin → {revenue,cost,margin}`, `getBillingCloseReadiness → {ready,concerns}`, `RecordPaymentInput`.
**Pattern for 9c:** define each reader's return type co-located in its analytics file (inline object types or small exported `type`s); use `$inferSelect` where a bare row is returned; money as decimal strings.

---

## Section 8 — Lint / type-check / build baseline

Post-9b.6, branch `phase-9-aggregator-dashboard-analytics`, HEAD `a648c52`:
- `npm run lint` (= `eslint`) → **LINT_EXIT=0** ✅ clean.
- `npx tsc --noEmit` → **TSC_EXIT=0** ✅ clean. (Project has no dedicated `typecheck` script; `tsc --noEmit` is the check.)
- `npm run build` (`next build`) — **not run** (skipped per the >2min guidance; `tsc --noEmit` covers type-correctness, the relevant gate for adding reader files).

**Known-clean baseline established.** Any lint/type failure after 9c is 9c's responsibility. (Note: `package.json` confirms CF-8c.8.3 still holds — no test runner; ephemeral `scripts/verify-*` remain the empirical layer for 9c.)

---

## Cross-cutting flags

1. **Pattern is unambiguous and matches the 9a §8 assumption:** explicit-`tenantId` readers, `import "server-only"`, bare `db`, file-per-domain, money-as-strings, empty→`[]`/`"0.00"`. The 9a proposal's "mirror billing" instruction is directly executable.
2. **One pattern nuance vs the 9a sketch:** invoice "pending" should come from `vendor_invoices`/`client_invoices` **`status` + `payment_status`** (well-indexed `(tenant_id, status)`), **not** from `job_billing_events` types (append-only audit, not current state). And `client_invoices.status` has no `partially_paid` — paid-ness is in `payment_status`. Manifest must pin the exact pending predicates.
3. **History read-path gotcha:** `job_status_history` is the **only** history table lacking a `(…, created_at)` composite — time-in-status diffing filesorts per job. Benign now; a scale watchpoint.

## "Would-have-been-9b in retrospect" — index candidates (decide: roll into 9c, or defer)
- **`job_status_history (tenant_id, job_id, created_at)`** — would let time-in-status diffing index-scan in order instead of filesort. The strongest candidate; the only history table missing the created_at composite. **Recommend: defer** unless the manifest wants it — current data is tiny, and it's a clean future add (no consuming-query lock-in changes).
- **`priorities (tenant_id, rank)`** — **recommend: do NOT add** (≈5 rows/tenant; in-memory sort is free).
- No other gaps: `(tenant_id, status)` exists on both invoice tables, `(tenant_id, job_id)` on all history/assignment tables, `(tenant_id, event_type)` on billing events, the two 9b indexes on jobs. The substrate is well-indexed for the §8 reader set.
