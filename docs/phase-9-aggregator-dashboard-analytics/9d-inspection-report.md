# Phase 9 — 9d.1 Inspection Report (sandbox seed + reader exercise harness)

**Phase:** 9 — Aggregator Dashboard & Analytics MVP
**Sub-batch:** 9d.1 — inspection sweep grounding the 9d seed/harness manifest
**Branch:** `phase-9-aggregator-dashboard-analytics` · **HEAD:** `2ae0576` (9c.7)
**Date:** 2026-05-29
**Status:** inspection facts only — no design opinions (those go in the 9d.2 manifest). No sandbox/production mutation performed.

> Capture via file-redirect + a read-only sandbox probe + a repo-exploration sweep. **Two consequential findings up front:** (1) **migrations contain ZERO INSERTs** — all reference data (statuses/trades/priorities/dispatch-statuses/roles) is seeded by `db/seeds/*.ts`, so a fresh 0000→0024 replay yields an empty-of-data schema; the 9d seed must run/replicate the reference seeds before operational data. (2) **`created_at` IS overridable via a direct drizzle insert** (standard SQL "explicit value overrides column DEFAULT" — `defaultNow()` only fires when the column is omitted); the constraint is that the *creator functions* (`createJob`, etc.) don't expose a `createdAt` param, so the backdating seed must use **direct inserts**, not those functions.

---

## Section 1 — Sandbox state confirmation

**A. Sandbox empty — confirmed.** `SELECT COUNT(*) … TABLE_SCHEMA='jonnyrosero_pm_sandbox'` → **`table_count = 0`**. Connected DB confirmed `jonnyrosero_pm_sandbox`. The post-9b.6 resting state holds; the seed is designed against this baseline.

**B. Replay pattern still operative.** The env-var `DATABASE_URL`-override invocation (manifest §6, documented at 9b.5.0) remains the way to target the sandbox: export a sandbox-swapped `DATABASE_URL` before `db:migrate`; dotenv `override:false` keeps it. Not run during inspection (no mutation). **Setup implication (for the manifest to decide):** because migrations carry no data (§3), getting the sandbox to a *usable* state is **two steps** — (1) `drizzle-kit migrate` 0000→0024 for the schema, then (2) run the reference seeds (`job-reference`, `trades`, `dispatch-reference`) to populate the vocabulary — *before* the 9d operational seed. Option (a) "seed orchestrates the whole thing" vs (b) "operator replays + reference-seeds separately, 9d seed assumes a vocabulary-ready sandbox" is a manifest call.

---

## Section 2 — Phase 8 seed / fixture patterns

**A. Seed scripts exist — `db/seeds/`, all idempotent, all import `@/server/db`.** Run via `tsx --env-file=.env.local`:
- `initial.ts` (P1) — `roles`, `tenants`, `users` (via better-auth), `tenant_users`, `user_roles`. Idempotent: skips by `roles.key` / `tenants.slug` / `users.email`. Env-driven (`SEED_ADMIN_PASSWORD`, `SEED_TENANT_NAME`/`SLUG`, default "Demo Aggregator"/"demo").
- `trades.ts` (P3) — `trades` (global). Idempotent by `trades.code`.
- `job-reference.ts` (P4) — **`priorities` (tenant-scoped)** + `job_statuses` (global) + `tenant_job_sequences` (per-tenant counter). Idempotent: priorities by `(tenant_id, code)`, statuses by `code`.
- `dispatch-reference.ts` (P5) — `dispatch_assignment_statuses` (global). Idempotent by `code`.
- `agent-config.ts` (P7) — agent prompt/policy defaults (no tenant rows).

Idempotency style throughout: **check-existing-then-skip** (not delete-first, not upsert). DB client: `import { db } from "@/server/db"` (no own connection) — so they obey whatever `DATABASE_URL` is set (the sandbox-override pattern works on them too).

**B. No test fixtures / factories.** No `factory`/`fixture`/`createTest*` patterns (consistent with CF-8c.8.3 — no test framework). The seed creates records via the production creator functions or direct drizzle inserts.

---

## Section 3 — Reference data: how it lands

**A. ⚠️ Migrations have ZERO INSERTs.** `grep -lE "INSERT" db/migrations/*.sql` → **0 files**. Reference vocabularies (`job_statuses`, `trades`, `priorities`, `dispatch_assignment_statuses`, `roles`) are **not** migration-embedded — they're populated by the `db/seeds/*` scripts above. **A fresh 0000→0024 replay produces a structurally-complete but data-empty schema.** (This is *why* the 9b.3.3 fresh-replay verify checked structural parity only — correct then; relevant now because the 9d seed cannot assume reference data exists post-replay.)

**B. `priorities` do NOT auto-create on tenant creation.** There is no tenant-init hook; `job-reference.ts` seeds priorities *for a resolved tenant* (`db.insert(priorities).values({ tenantId: tenant.id, code, name, rank, … })`, the 5: EMERGENCY/URGENT/HIGH/ROUTINE/SCHEDULED, ranks 1–5). Production's demo tenant got its 5 priorities from running that seed. **→ The 9d seed must create its seed tenant's priorities itself** (reuse the job-reference values or insert directly). `job_statuses`/`trades`/`dispatch_assignment_statuses` are global — seed them once (tenant-independent).

---

## Section 4 — Tenant / user creation

**A. Tenant creation = direct `db.insert(tenants)`** (no dedicated `createTenant` function; done inline in `initial.ts`): `{ name, slug, type:"aggregator", status:"active" }`. **Auto-creates nothing** (no default priorities/users/roles) — each is a separate explicit step.

**B. User creation = better-auth `auth.api.signUpEmail({ body: { email, password, name } })`** (from `@/server/auth`; handles password hashing). Role assignment = direct `user_roles` insert (`tenantId=null` for global `super_admin`; explicit `tenantId` for tenant roles). Membership = direct `tenant_users` insert (`{ tenantId, userId, status:"active" }`). **→ The 9d seed needs users (tenant_admin / operator / accounting for the 9e role-gated dashboard) and must call `signUpEmail` per user, then insert `tenant_users` + `user_roles`.** Users are **global** (not tenant-scoped) — relevant to idempotency (§6).

---

## Section 5 — Operational-entity creators (+ the timestamp question)

All creators take **explicit `tenantId`** and set `created_at` via schema **`defaultNow()`** (none of the creator *functions* expose a `createdAt` param):

| Entity | Creator | File | tenantId | createdAt |
|---|---|---|---|---|
| Clients | `createClient(input)` | `src/server/clients.ts` | param | `defaultNow()` (writes audit log) |
| Client locations | `createLocation(...)` | `src/server/clients.ts` | param | `defaultNow()` |
| Jobs | `createJob(input)` | `src/server/jobs.ts` | param | `defaultNow()`; allocates `job_number` via locked `tenant_job_sequences`; writes the **initial `job_status_history` row inline** (`from=null → initialStatus`) |
| Status transitions | inline in `createJob` (no extracted transition writer surfaced) | `src/server/jobs.ts` | — | `defaultNow()` |
| Dispatch/assignments | `createDispatch(input)` | `src/server/dispatch.ts` | param | `defaultNow()`; lands at DRAFT; re-derives matcher facets; writes assignment status-history inline |
| Vendor check-ins | **no creator function** (schema only) | `schema/dispatch-presence.ts` | — | seed inserts directly; cols: `assignment_id`, `occurred_at`, `created_at` defaultNow |
| Vendor invoices | `recordVendorInvoice(input)` | `src/server/billing/vendor-invoices.ts` | param | `defaultNow()`; status `received` |
| Client invoices | `createClientInvoice(input)` | `src/server/billing/client-invoices.ts` | param | `defaultNow()`; status `draft` |

**⚠️ Timestamp-override — the key seed concern, corrected:** the creator *functions* hardcode no `createdAt` and rely on `defaultNow()`, so calling them yields `created_at = NOW()`. **But `created_at` is fully overridable via a *direct* drizzle insert** — `db.insert(jobStatusHistory).values({ …, createdAt: pastDate })` inserts `pastDate` (standard SQL: an explicit column value overrides the column DEFAULT; `defaultNow()` only fires when the column is omitted). *(The exploration sweep initially asserted the value is "IGNORED" — that is incorrect; it conflated "the creator functions don't pass it" with "can't be passed." To be fully empirical under the no-mutation rule, this will be confirmed on the first seed run in 9d.3 — but it is standard drizzle/MySQL behavior.)* **Consequence:** the backdating seed (status-history rows with deliberately old `created_at` to produce specific dwell durations) should **bypass the creator functions and use direct drizzle inserts** with explicit `createdAt` (and `updatedAt` where relevant). It must then also self-manage what `createJob` normally does: allocate `job_number` (+ seed `tenant_job_sequences`) and write the initial history row.

---

## Section 6 — Idempotency strategy options (feasibility)

All 9d seed data is tenant-scoped under one (or few) seed tenant(s). FK evidence (9b.1 `SHOW CREATE TABLE jobs`): the tenant FK is **`ON DELETE CASCADE`** (`jobs_tenant_id_tenants_id_fk … ON DELETE CASCADE`), and the job-child FKs (`job_status_history`, `job_vendor_assignments`, invoices) are `ON DELETE CASCADE` to `jobs`; `vendor_check_ins`→`job_vendor_assignments` is CASCADE. So the FK chain collapses under a single tenant delete.

- **(i) DROP + replay + reseed** — drop all sandbox tables, replay 0000→0024, re-run reference seeds, then operational seed. Most deterministic; slowest (full replay each run); also the most faithful "from zero" reset.
- **(ii) DELETE-by-tenant (cascade) + reseed** — `DELETE FROM tenants WHERE id = <seed tenant>` cascades the entire operational + tenant-scoped graph (priorities, jobs, history, assignments, check-ins, invoices) in one statement; global reference data (trades, job_statuses, dispatch-statuses) persists harmlessly. **Tractable** thanks to CASCADE — no manual reverse-FK ordering needed. **Caveat:** better-auth `users` are **global** (not cascaded by tenant delete); the seed must handle user idempotency separately (reuse by email, or delete `user_roles`/`tenant_users`/`users` for the seed users explicitly).
- **(iii) tenant-suffix accumulate** — new timestamped tenant each run; never deletes. Simplest to write; accumulates cruft; sandbox cleanup becomes a separate chore.

All three are technically feasible. (ii) is fast and the CASCADE makes it clean except for the global-users caveat; (i) is the gold-standard reset but pays the replay cost each run. Manifest decides.

---

## Section 7 — 9c reader exercise harness

**A. Targeting:** the harness uses the same env-var `DATABASE_URL`-override (sandbox) + `--conditions=react-server` (the 9c readers `import "server-only"`) invocation the 9c smoke scripts used. **No existing non-production reader-exercise/integration scripts** (confirmed — CF-8c.8.3, no test runner; the only retained `scripts/*` are the two `.mjs` migration helpers).

**B. Ephemeral-vs-retained (open question for the manifest):** the 9c smoke scripts were ephemeral (deleted at 9c.7). The 9d harness is richer — it asserts *expected aggregations against a deterministic seeded shape*, which is the closest thing the platform has to a regression test. Precedent says ephemeral; the value argument says retain (it + the seed together are a re-runnable correctness check, partially addressing CF-8c.8.3). Noted, not decided.

---

## Section 8 — Lint / type-check baseline

Post-9c.7 (`2ae0576`): `npx tsc --noEmit` → **exit 0**; `npm run lint` (eslint) → **exit 0** (clean re-confirm; the first piped capture lost the code, re-run confirms). Known-clean baseline holds; any post-9d failure is 9d's.

---

## Cross-cutting flags for the 9d manifest

1. **Reference data is seed-borne, not migration-borne** — the sandbox setup is replay **+** reference-seeds **+** operational-seed (3 stages), or the 9d seed orchestrates all of it. This is the single biggest shaping fact.
2. **Backdating requires direct drizzle inserts** (not the creator functions) — the seed re-implements `createJob`'s job_number allocation + initial-history-row write, with explicit `createdAt`. Confirm the explicit-`createdAt` insert empirically on the first 9d.3 run.
3. **Idempotency via tenant-cascade-delete is clean** (option ii) except better-auth `users` are global — the seed handles user reuse/cleanup separately. Or option (i) DROP+replay for gold-standard determinism.
4. **Priorities are per-tenant and seed-created** — the 9d seed creates its tenant's 5 priorities (no auto-init).
5. **`vendor_check_ins` has no creator** — seed inserts directly (needed for SCHEDULED-stalled coverage: some scheduled jobs WITH check-ins = not stalled, some WITHOUT = stalled).
6. **Seed-coverage requirement (banked, manifest §11)** — stalled-vs-fresh, all four urgency tiers, data-blocked populations (`due_at`/`scheduled_start_at`/`completed_at` set), billing states (pending AR/AP), multi-vendor — all achievable with direct inserts + backdated timestamps.
