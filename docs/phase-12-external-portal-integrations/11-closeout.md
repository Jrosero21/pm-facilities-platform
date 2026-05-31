# Phase 12 — External Portal Integration Framework — Closeout

**Target tag:** `v1.3.0-phase-12` · **Branch:** `phase-12-external-portal-integrations` → `main` · **Closed:** 2026-05-30

## 1. Goal (roadmap §8 Phase 12)
A generic, source-agnostic external-portal integration framework + ONE adapter skeleton (ServiceChannel), keeping the platform provider-agnostic (§2.1). Explicitly NOT a live integration (no all-providers, no email parser, no full bidirectional automation).

## 2. Completed deliverables
- **12 `external_*` tables** (migrations 0028–0032), sandbox + prod applied + contract-verified.
- **Generic core** (`src/lib/integrations/core/`): adapter contract (types), self-registration seam (registry), code-resolution (mapping, F5 tenant-dim), inbound ingest engine, shared sync orchestration + outbound push.
- **Server layer**: the system/integration user (SF-1) + seed, the ingest authz wrapper.
- **ServiceChannel adapter skeleton** (real `normalizePayload`; deferred fetch/push) — added with **zero core change** (§2.1 proven).
- **Phase-blocking harness** — 25 assertions, 25/0 green.

## 3. Files
- `src/server/schema/external-systems.ts`, `external-mappings.ts`, `external-sync.ts` (+ barrel) — the 12 tables.
- `src/lib/integrations/core/{types,registry,mapping,ingest,sync}.ts`
- `src/lib/integrations/servicechannel/{adapter,index}.ts`
- `src/server/integrations/{system-user,ingest-external-job}.ts`
- `scripts/{seed-system-user,check-external-integrations}.ts` · `db/migrations/0028…0032` · `package.json` runner.

## 4. DB changes
12 tables / 5 migrations (full detail + FK matrix in `08-db-changes.md`). Prod: 12 external_* tables, 93 total, 33 migrations. FK rules: CASCADE default; SET NULL for `external_systems.created_by_user_id`, `external_work_order_links.job_id`, `external_payload_logs.sync_run_id` (audit-preservation).

## 5. Server entry points
`ingestExternalJob`, `pushStatusToExternal`, `getSystemUserId`, the registry + adapter. No HTTP routes (framework). See `09-api-routes.md`.

## 6. Workflows
Inbound: resolve client(park)/location(auto-stub)/codes(default+flag) → createJob@NEW → ewol link → sync log. Outbound: resolve outbound status → adapter no-op → log. Adding a provider = a folder + one registration line. See `05-system-workflows.md`.

## 7. Business rules
Source-agnostic (§2.1), F5 priority tenant-dim, IF-7 client-park vs location-auto-stub asymmetry, IF-6 land-NEW-record-not-apply, OQ-6 no-margin-outbound, no-credential-leak, IF-3 dedup, IF-4 createJob-then-link. Full set in `06-business-rules.md`.

## 8. Verification — `check-external-integrations.ts`, **25 passed / 0 failed, true exit 0** @ commit `66b1377` (independently re-verified at 12k.1):
- **A source-agnostic (4):** jobs row `source_type='external_client_portal'`+sourceExternalId; ewol link; landed NEW; mapped status RECORDED in sync_event, not applied.
- **B mapping incl F5 (4):** trade→global, priority→tenant-A's, **2nd tenant same code→its own priority**, status→global.
- **C tenant isolation (4):** A can't read B's mappings; cross-tenant push→`JOB_NOT_EXTERNALLY_LINKED`; ingest links only the acting tenant; every row's tenant_id correct.
- **D no-credential-leak + OQ-6 (5):** seeded `HARNESS_SECRET_MARKER` absent from all payload_logs (ingest+push) + sync_event metadata; outbound log has no cost/markup/margin key.
- **E locked behaviors (7):** IF-7 park (no job/client), auto-stub w/ real address, IF-3 skip+touch, adapter resolves, no-op push, normalizePayload mapping.
- (+1 setup assertion = 25 total.)

The harness is sandbox-guarded, destructive, re-seed-first; builds + tears down its own 2-tenant fixture. Migrations 0028–0032 verified `-E` + FK-matrix on sandbox and prod. tsc green throughout.

**Process note (honest record):** 12k first committed a **false-green** (claimed 24/24 while the run was 23/2); it was caught, `git reset --soft`'d (unreachable, `25e18eb`), the real failure root-caused to a harness JSON-read bug (the engine was correct — `sync_events.metadata` round-trips as a raw string; fixed with a boundary parse, NOT by weakening the assertion), then re-run genuinely green and re-verified independently (12k.1). Lesson banked: read gate verdicts from the captured file + true exit code, never an interleaved console.

## 9. Known limitations
Skeleton adapter (no live HTTP/creds), operator UIs deferred, encryption-at-rest deferred, IF-4 orphan window, auto-push not wired. Full list in `10-known-limitations.md`.

## 10. Carry-forwards
`closeout-carryforwards.md` — CF-12.1 (auto-push), CF-12.2 (live adapter), CF-12.3 (operator UIs), CF-12.4 (encryption), CF-12.5 (orphan window) + inherited + watchpoints.

## 11. Recommended next-phase focus
**Phase 13 — email ingestion** (roadmap §8). Plus, whenever a real provider is onboarded, **CF-12.1 live-integration activation**: real adapter HTTP + credential decryption (F1) + auto-push hooks + `portal_update_queue` drain — all building on the framework this phase proved.

## 12. Sign-off
Framework complete; harness 25/0 green + independently re-verified (`66b1377`); 11 closeout docs written. Commit docs (12p-B) → tag `v1.3.0-phase-12` + ff-merge to `main` + cut `phase-13` (12p-C) are the gated remaining steps.
