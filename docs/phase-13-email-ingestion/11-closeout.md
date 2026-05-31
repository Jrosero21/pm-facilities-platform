# Phase 13 — Email Ingestion — Closeout

**Target tag:** `v1.4.0-phase-13` · **Branch:** `phase-13-email-ingestion` → `main` · **Closed:** 2026-05-31

## 1. Goal (roadmap §8 — Phase 13)
Ingest inbound work-order emails into the same `jobs` substrate as a reviewable draft → job, source-agnostic (§2.1) and human-gated (§2.5). A framework + parser path, NOT a live mail integration (parser stubbed, receiver deferred — the Phase-12 precedent).

## 2. Completed deliverables
- **6 `email_*` tables** (migrations 0033–0035), sandbox + prod applied + contract-verified.
- **Reader seam** (`src/lib/integrations/email/`): `EmailReader` contract + `parser_kind` registry + two stub readers (deterministic, ai_assist) — mirrors the Phase-12 PortalAdapter/registry, zero core change to add a reader.
- **Ingest engine** (`ingestEmail`): parse → record `email_parse_results` + `email_work_order_drafts` @ pending_review; record-don't-apply; dedup flag-don't-reject.
- **Draft→job wrappers** (`approveEmailDraft`/`rejectEmailDraft` + shared `createJobFromDraft`): approval → `createJob` @ NEW (email provenance), the CF-13.1 autonomy seam.
- **Phase-blocking harness** — 21 assertions, 21/0 green.

## 3. Files (the 7 implementation commits)
- `src/server/schema/email-ingestion.ts` (+ barrel) — the 6 tables · `db/migrations/0033…0035`.
- `src/lib/integrations/email/{core/types,core/registry,readers/deterministic/*,readers/ai-assist/*,index}.ts`
- `src/server/integrations/ingest-email.ts` (ingest + approve/reject + createJobFromDraft).
- `scripts/check-email-ingestion.ts` · `package.json` runner (`db:check:email-ingestion`).
- `docs/phase-13-email-ingestion/` (13a/13b + this 11-doc set + carryforwards).
- Ledger: `e999d4d`(0033) → `fda9db9`(0034) → `0724d6f`(0035) → `e26594a`(seam) → `d932057`(ingest) → `b291b03`(approve/reject) → `5c47718`(harness).

## 4. DB changes
6 tables / 3 migrations (full detail in `08-db-changes.md`). Prod: 99 tables, 36 migrations. Non-unique dedup index (OQ-13.4), decimal(5,4) confidence, drafts 2-CASCADE/7-SET-NULL.

## 5. Server entry points
`ingestEmail`, `approveEmailDraft`, `rejectEmailDraft` (+ internal `createJobFromDraft`), the reader registry. No HTTP routes/UI (CF-13.7). See `09-api-routes.md`.

## 6. Workflows
Ingest (parse → draft, record-don't-apply, dedup-flag); approve (lock+recheck → createJob @ NEW → re-check-guarded link, IF-4 ordering); reject. §2.5/CF-13.1 boundary in approve. See `05-system-workflows.md`.

## 7. Business rules
R-13.1…R-13.12 (record-don't-apply, dedup flag-don't-reject, approve attribution, dual identity, readiness gate, one-time review, isolation, D-7 config-only, source-agnostic seam, never-throws parse, continuous confidence). Each cites its harness assertion. See `06-business-rules.md`.

## 8. Verification — `check-email-ingestion.ts`, **21 passed / 0 failed, true exit 0** @ `5c47718`:
- **A reader seam (3):** getReader resolves both kinds; listRegisteredReaders has both; bogus → UNKNOWN_PARSER_KIND.
- **B record-don't-apply (4):** ingest → drafted; parse_results (deterministic/failed/0); draft pending_review + null client; NO job at ingest + status='drafted'.
- **C dedup flag-don't-reject (3):** duplicate → duplicate_flagged + no new draft; row preserved; **live `inbound_emails_tenant_message_idx` NON_UNIQUE=1**.
- **D approve happy-path (4):** returns jobId; job sourceType=email_ingestion/createdBy=system/NEW; draft→approved+linked+reviewer; sourceExternalId=message_id.
- **E readiness+reject+isolation (5):** null-client → DRAFT_CLIENT_UNRESOLVED (no job); null-location → DRAFT_LOCATION_UNRESOLVED; reject → rejected; re-approve → DRAFT_NOT_PENDING_REVIEW; cross-tenant → DRAFT_NOT_FOUND.
- **F D-7 (1):** email_parser_rules has no client_id column / no FK to clients (live schema query).
- (+1 setup assertion = 21 total.)

The harness is sandbox-guarded, destructive, seed-dependent; reuses T-A + builds/tears-down T-B + its own inbound/draft rows. Migrations 0033–0035 verified `-E` + FK-matrix on sandbox and prod. tsc green throughout.

**Process notes (honest record):** (1) A **phantom "schema modified"** reading appeared mid-13g/13h (stale git index mtime after `tsc` touched files) — `git diff HEAD` showed 0 bytes; resolved by `git update-index --refresh`, no real change. (2) A **stale `tsconfig.tsbuildinfo`** replayed phantom cross-script `tsc` "Cannot redeclare" errors at 13i — the source was clean; resolved by `rm tsconfig.tsbuildinfo` (banked as WP-13.2). Both were caught by reading authoritative state (diff-vs-HEAD, fresh cacheless tsc) rather than trusting the first signal.

## 9. Known limitations
Stubbed parser (CF-13.3), no live receiver (CF-13.2), no review UI (CF-13.7), resolution column deferred (CF-13.5), attachment backend deferred (CF-13.4), approve→link orphan window (CF-13.6). Full list in `10-known-limitations.md`.

## 10. Carry-forwards
`closeout-carryforwards.md` — CF-13.1…CF-13.7 + inherited (FB-10x, CF-11.x, CF-12.x) + watchpoints (WP-13.1, WP-13.2).

## 11. Recommended next-phase focus
**Phase 14 — Preventative Maintenance** (roadmap). The email-ingestion activation track (CF-13.1/13.2/13.3/13.7 — real parser + live receiver + review UI + auto-create) is the parallel work whenever email goes live; it builds entirely on the substrate this phase proved.

## 12. Sign-off
Data + API layer complete; harness 21/0 green (`5c47718`); 11 closeout docs written. Commit docs → tag `v1.4.0-phase-13` + push + ff-merge to `main` + cut `phase-14` are the gated remaining steps.
