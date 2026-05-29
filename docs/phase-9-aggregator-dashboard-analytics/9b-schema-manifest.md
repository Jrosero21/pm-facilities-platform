# Phase 9 — 9b Schema-Gate Manifest

**Phase:** 9 — Aggregator Dashboard & Analytics MVP (target `v1.0.0-phase-9`)
**Sub-batch:** 9b — schema gate (the *only* schema change in Phase 9)
**Branch:** `phase-9-aggregator-dashboard-analytics`
**Date:** 2026-05-28
**Predecessors:** `00-inspection-report.md`, `01-design-proposal.md` (§6 decision: compute-on-read + add the two deferred indexes), `9b.1` inspection (approved)
**Status:** manifest draft — gates 9b.3 (schema edit + `db:generate`). No schema edits, no `db:generate`, no migrations yet.

---

## Section 1 — Scope statement

This sub-batch (Phase 9, 9b) makes the **only schema change in all of Phase 9**: two non-unique secondary indexes on the existing `jobs` table. Both were **deliberately deferred from earlier phases** to "the consuming phase" (inspection §9, Phase-4 carry-forward: *"the consumer defines the right composite … add in the consuming phase"*). Phase 9 is that consumer — the dashboard's composite-urgency queue performs **overdue detection** (filtering by `due_at`), and the platform's **source-type analytics / filtering** read on `source_type`. Per the §6 design decision (compute-on-read, no materialization), these indexes are what keep those tenant-scoped reads cheap.

**Non-scope (explicitly out of this sub-batch):** no new tables, no new columns, no foreign keys, no enum changes, no data migration/backfill, no reader code (`src/server/analytics/` is 9c), no UI (`/dashboard` and the `/jobs` filter extension are 9e). Two `CREATE INDEX` statements on existing columns — nothing else.

---

## Section 2 — The two indexes (precise spec)

| Name | Columns | Unique | Purpose |
|---|---|---|---|
| `jobs_tenant_due_idx` | `(tenant_id, due_at)` | no | Overdue detection in the dashboard composite-urgency queue (`now > due_at`); tenant-scoped due-date filtering in metric readers. |
| `jobs_tenant_source_idx` | `(tenant_id, source_type)` | no | Source-type aggregations in future analytics and source-scoped reads. Lands **now** per the deferred-to-consuming-phase rule, even though the MVP queue UI does not yet filter on `source_type`. |

**Note on `source_type`:** it is a real MySQL `enum` (8 values — `manual, internal_client_portal, external_client_portal, email_ingestion, forwarded_email, api, preventative_maintenance, snow_event`), so the index is compact and selective. No covered-index / prefix-length considerations apply at this data volume.

**Note on the `?source=` `/jobs` UI filter:** **out of scope here.** That is 9e UI work. The index lands now regardless — the consuming-phase rule is about *where the schema affordance is decided*, not about gating it behind the specific UI that will eventually use it. The `due_at` index, by contrast, *is* consumed in-phase by the 9c/9e queue.

---

## Section 3 — Naming alignment

- The established pattern (inspection §A) is `jobs_tenant_<discriminator>_idx` for tenant-leading non-unique composites — all six existing deliberate composites use it (`jobs_tenant_status_idx`, `_client_idx`, `_location_idx`, `_trade_idx`, `_priority_idx`, `_created_idx`).
- The two new names — `jobs_tenant_due_idx`, `jobs_tenant_source_idx` — slot into that family with **zero deviation**.
- Both are well under MySQL's 64-char identifier limit (`jobs_tenant_source_idx` = 22 chars), so `check-migration-identifiers.mjs` will pass.

---

## Section 4 — Implementation plan (schema source first)

**Path to drizzle path is authoritative:** `drizzle.config.ts` globs `./src/server/schema/*.ts` and emits to `./db/migrations`. We edit the schema source, then `db:generate` produces the migration. This is **not** a hand-written raw-SQL migration.

### 4a. Exact code form (from the live block)

The current index block in `src/server/schema/jobs.ts` (lines 104–112) reads verbatim:

```ts
  (t) => [
    uniqueIndex("jobs_tenant_number_unique").on(t.tenantId, t.jobNumber),
    index("jobs_tenant_status_idx").on(t.tenantId, t.currentStatusId),
    index("jobs_tenant_client_idx").on(t.tenantId, t.clientId),
    index("jobs_tenant_location_idx").on(t.tenantId, t.clientLocationId),
    index("jobs_tenant_trade_idx").on(t.tenantId, t.primaryTradeId),
    index("jobs_tenant_priority_idx").on(t.tenantId, t.priorityId),
    index("jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
```

Observed style: one `index(...).on(...)` per line, trailing comma on every entry, camelCase Drizzle property refs (`t.dueAt`, `t.sourceType` — the columns are declared `dueAt: datetime("due_at")` and `sourceType: mysqlEnum("source_type", …)`). The `uniqueIndex` sits **first** in the block; the non-unique composites follow. There is **no** trailing unique block, so new composites append cleanly after the last composite (`jobs_tenant_created_idx`) and keep all the tenant composites grouped together.

### 4b. The two lines to add (verbatim, slotted after `jobs_tenant_created_idx`)

```ts
    index("jobs_tenant_due_idx").on(t.tenantId, t.dueAt),
    index("jobs_tenant_source_idx").on(t.tenantId, t.sourceType),
```

Resulting block after the edit:

```ts
  (t) => [
    uniqueIndex("jobs_tenant_number_unique").on(t.tenantId, t.jobNumber),
    index("jobs_tenant_status_idx").on(t.tenantId, t.currentStatusId),
    index("jobs_tenant_client_idx").on(t.tenantId, t.clientId),
    index("jobs_tenant_location_idx").on(t.tenantId, t.clientLocationId),
    index("jobs_tenant_trade_idx").on(t.tenantId, t.primaryTradeId),
    index("jobs_tenant_priority_idx").on(t.tenantId, t.priorityId),
    index("jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("jobs_tenant_due_idx").on(t.tenantId, t.dueAt),
    index("jobs_tenant_source_idx").on(t.tenantId, t.sourceType),
  ],
```

No other edit to `jobs.ts`. `index` is already imported (used by the six existing composites) — no import change.

### 4c. Generate

Run `pnpm db:generate` (= `drizzle-kit generate && node scripts/fix-mysql-engine.mjs && node scripts/check-migration-identifiers.mjs`). drizzle-kit emits `db/migrations/0024_<slug>.sql` (next sequential after `0023_brave_stranger`; head journal idx is 23), updates `db/migrations/meta/_journal.json` (+1 entry, idx 24), and writes `db/migrations/meta/0024_snapshot.json`. The post-generate scripts run automatically: `fix-mysql-engine.mjs` (engine normalization) and `check-migration-identifiers.mjs` (64-char identifier guard — passes, §3).

---

## Section 5 — Expected emitted SQL

drizzle-kit MySQL adds secondary indexes with bare `CREATE INDEX` statements (breakpoint-separated). Expected `0024_<slug>.sql`:

```sql
CREATE INDEX `jobs_tenant_due_idx` ON `jobs` (`tenant_id`,`due_at`);
--> statement-breakpoint
CREATE INDEX `jobs_tenant_source_idx` ON `jobs` (`tenant_id`,`source_type`);
```

(Statement order may be either index first; both are independent and order-irrelevant. drizzle may or may not insert the `--> statement-breakpoint` between them — both forms are acceptable.)

**Surface at 9b.3 review if the emitted SQL differs from the above**, specifically: an `ALTER TABLE jobs ADD INDEX …` form instead of `CREATE INDEX`; auto-generated/hashed index names instead of the two declared names; any **additional** statements (i.e., drizzle picking up unrelated schema drift — would mean the schema source and DB had diverged, a real problem to stop on); or any touch to columns/FKs. Any of these is a stop-and-review trigger before applying anywhere.

---

## Section 6 — Verification plan

> **Revision 2026-05-28 (9b.3 mid-flight):** §6 reshaped after substrate discovery — the sandbox is empty, not a prod clone as the original session handoff implied. Approach revised to fresh-replay 0000→0024; no scope change to the actual migration. **CF-8b.1 status (verified 9b.3.1):** already **DISCHARGED** at the `v0.9.0-phase-8` tag — its annotation records *"CF-8b.1 fresh-migration verify: PASSED — a from-scratch 0000→0023 migration reproduces the live schema identically (78 tables / 922 cols / 368 indexes / 228 FKs), modulo DB-name/AUTO_INCREMENT/row-data/`__drizzle_migrations`. Verified via cPanel-provisioned scratch DB."* So this fresh-replay **re-affirms** CF-8b.1 and **extends** the from-scratch reproduction proof through 0024 (the new index migration) — it does not discharge an open item.

9b.3 — schema edit + db:generate + fresh-replay verify into sandbox. The sandbox (`jonnyrosero_pm_sandbox`) is an empty scratch DB suitable for the from-scratch replay — it sits empty between verify passes. (Note: the `v0.9.0-phase-8` §7.5 verify used a *cPanel-provisioned* scratch DB, not this sandbox; either is a valid throwaway target.) The verify runs `drizzle-kit migrate` against the sandbox URL, replaying migrations 0000→0024 from empty. This simultaneously:
  - Asserts the new migration applies cleanly in its chain context.
  - Re-affirms CF-8b.1 §7.5's from-scratch reproduction, extended through 0024.
  - Validates the full Phase 0–9 schema is internally consistent.

Structural verify after replay: `SHOW INDEX FROM jobs` in sandbox returns 16 distinct `INDEX_NAME`s (14 pre-existing + the 2 new); `jobs_tenant_due_idx` and `jobs_tenant_source_idx` each return their `(tenant_id, <col>)` seq-ordered rows. **CF-8b.1 step-3 reproduction check:** after the replay, a follow-up `pnpm db:generate` must report **no new migration** ("No schema changes") — proving the migration chain reproduces the schema the ORM expects through 0024 (this is a schema-source ↔ migration-snapshot consistency check, DB-agnostic). Note: the CF-8b.1 'positional `drizzle(conn)`' gotcha applies only to hand-written programmatic migrators; the `drizzle-kit` CLI manages its own connection internally, so the gotcha is non-applicable here.

**Sandbox-migrate invocation pattern (template for future schema-gate manifests).** The project has no `db:migrate:sandbox` npm script. `drizzle-kit migrate` reads `process.env.DATABASE_URL` through `drizzle.config.ts`, where dotenv's `config()` runs with the default `override:false` — so an **already-set** `DATABASE_URL` in the environment takes precedence over the value in `.env.local`. To target the sandbox, **export `DATABASE_URL` with the sandbox DB name swapped in** (derive it from `.env.local` so the password is never echoed) before invoking `db:migrate`; production runs use the unmodified `.env.local` default (no override). Confirm the target with a password-redacted check (print only the part after `@`) before applying. Verified in 9b.3.3; consumed by future fresh-replay sub-batches and documented in full admin-SOP form in the Phase 9 closeout `04-admin-sop.md`.

9b.4 — folded into 9b.3 by this revision. No separate sub-step.

9b.5 — production apply via `db:migrate` (single pending migration 0024). Production structural verify: `SHOW INDEX FROM jobs` returns 16 `INDEX_NAME`s, both new indexes present with correct seq+columns.

---

## Section 7 — Rollback consideration

Both are non-unique secondary indexes on existing columns. Fully **non-destructive** — no data is read, written, or moved by adding them; there is nothing to reverse. If anything looked wrong post-apply (it won't, for two plain composites), `DROP INDEX jobs_tenant_due_idx ON jobs;` / `DROP INDEX jobs_tenant_source_idx ON jobs;` restores the prior state exactly. Pre-production, the sandbox provides unlimited re-runnability; the fresh-migration verify (9b.3 fresh-replay, §6) catches any replay-from-zero divergence before production is touched.

---

## Section 8 — Commit plan (9b.6)

Single commit on `phase-9-aggregator-dashboard-analytics`:

| File | Change |
|---|---|
| `src/server/schema/jobs.ts` | edited (two `index()` lines) |
| `db/migrations/0024_<slug>.sql` | new (the two `CREATE INDEX`) |
| `db/migrations/meta/_journal.json` | updated (+1 entry) |
| `db/migrations/meta/0024_snapshot.json` | new (drizzle snapshot) |
| `docs/phase-9-aggregator-dashboard-analytics/9b-schema-manifest.md` | new (this doc) |

Ephemeral verify script (`scripts/verify-9b-*`) is **NOT** committed — deleted before commit, per the ephemeral-verification-script discipline (Phase 8 cadence).

Commit message:
```
Phase 9 (9b): add deferred indexes jobs_tenant_due_idx + jobs_tenant_source_idx (consuming-phase landing per inspection §9)
```

---

## Section 9 — Sub-step gates ahead

Each reports and holds.

- **9b.3** — schema edit + `db:generate` + **fresh-replay verify into sandbox** (0000→0024, the merged sandbox+fresh-migration verify per §6; re-affirms CF-8b.1, extends the from-scratch proof through 0024). Report: schema diff, full emitted migration SQL, `_journal.json` diff, sandbox replay output, `__drizzle_migrations` state, sandbox structural verify (`SHOW INDEX FROM jobs` + 16-index count + cross-DB parity vs production), `db:generate` "no changes" reproduction check. **STOP and hold.**
- **9b.4** — **folded into 9b.3** by the §6 revision (an empty scratch DB replay is exactly the CF-8b.1 §7.5 check, now extended through 0024). No separate sub-step.
- **9b.5** — production apply + production verify. Report: production apply output, production verify (`SHOW INDEX FROM jobs`). **STOP and hold.**
- **9b.6** — commit per §8. Report: commit SHA, `git log --oneline -5`, file-touch confirmation. **STOP and hold.**
