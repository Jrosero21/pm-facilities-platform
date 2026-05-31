# Phase 12 — Decisions

Forks resolved across 12b (F1–F10), 12h-A.1 (IF-1..IF-7), 12h-B.0 (SF-1/SF-2), 12h-A.2 (D-12h.1/.2), 12i-A.1 (IO-1..IO-5). Each line = the as-built decision + rationale. Full surfacing in the `*-forks` docs.

## Schema / substrate forks (12b)
- **F1 — credentials full-shape, no live secret.** `external_credentials` ships the full secrets shape; the skeleton writes none; `encrypted_payload` only; encryption-at-rest deferred to the first live adapter (no prior secret-storage pattern existed). Credentials never enter logs.
- **F2 — systems + accounts, MVP one-to-one.** Both tables; multi-account-per-system deferred.
- **F3 — `provider` varchar(64), app-enforced.** New providers need no enum migration (the `job_notes.origin` lesson).
- **F4 — mapping `direction` enum now** (inbound/outbound/both); MVP populates inbound (+ both for location).
- **F5 — priority mapping tenant-scoped.** Status/trade target GLOBAL ref data (no tenant dim); priority is tenant-scoped, so `external_priority_mappings` carries `tenant_id` in its unique key.
- **F6 — all three log tables** (sync_runs / sync_events / payload_logs).
- **F7 — REVISED by IF-6** (see below).
- **F8 — adapter interface = normalizePayload/fetchWorkOrders/pushStatus; mapping is CORE, not adapter.**
- **F9 — three migration units** (0028/0029/0030), each its own gate. *(Extended to five by IF-2/D-12h.1.)*
- **F10 — phase-blocking harness** (`check-external-integrations.ts`).

## Ingest forks (12h-A.1)
- **IF-1 — unmapped status/trade/priority → ingest with a sensible default + a `sync_event` flag** (never reject, never silent-drop).
- **IF-2 — new `external_location_mappings` (migration 0031), tenant-scoped** — resolves a provider store ref → internal `client_location_id`.
- **IF-3 — re-ingest an already-linked WO → skip + touch `last_synced_at`** (the ewol unique enforces no dup).
- **IF-4 — createJob-first, then the ewol link** (createJob is a frozen self-contained txn). The ewol unique is the idempotency guard. The orphan window (job created before link) is a KNOWN LIMITATION.
- **IF-5 — ingest takes a hand-built `NormalizedWorkOrder`**; live adapter fetch deferred to 12j.
- **IF-6 (REVISES F7) — external jobs land at NEW; the mapped status is RECORDED in the sync_event metadata, NOT auto-applied.** No generic transition helper exists (12h-A S3); auto-advance on intake would breach R-5.8. NEW-then-triage is the established intake pattern (Phase 11 precedent).
- **IF-7 — unmapped CLIENT → PARK the WO** (sync_event error + payload_log; NO job, NO auto-client). Asymmetric vs location: an unmapped *location* auto-creates a stub under an already-mapped client.

## Ingest-authoring forks (12h-B.0)
- **SF-1 — a dedicated GLOBAL non-login system/integration user** (`integration@system.internal`) owns system-originated records (`createdByUserId`). Created by a direct `users` insert (no account/password) — a deliberate deviation from the better-auth signup pattern, appropriate for a service identity. Resolved by email (`getSystemUserId`).
- **SF-2 — `NormalizedWorkOrder` extended with optional location-detail fields** (locationName/addressLine1/city/stateProvince/postalCode/country); the adapter fills them from the payload; the auto-stub uses real data, `[NEEDS REVIEW]` only where a field is genuinely absent.

## Multi-client forks (12h-A.2)
- **D-12h.1 — new `external_client_mappings` (migration 0032)** — SubscriberId → internal `client_id`, tenant-scoped. The first resolution step at ingest.
- **D-12h.2 — `client_id` added to `external_location_mappings`** (migration 0032); unique becomes `(external_system_id, client_id, external_code)` — StoreId is per-client.

## Outbound forks (12i-A.1)
- **IO-1 — explicit generic outbound path** (`pushStatusToExternal(jobId)`); NO auto-hooks into the frozen status/note writers for MVP. (`portal_update_queue` exists; auto-drain deferred — CF-12.x.)
- **IO-2 — skeleton `pushStatus` no-op, loads NO credentials.**
- **IO-3 — shared run/log helpers extracted into `core/sync.ts`; `ingest.ts` refactored to consume them** (one substrate for inbound + outbound).
- **IO-4 — outbound payload_log = the push (status+note) + PushResult; never creds/cost/markup/margin.**
- **IO-5 — generic path + skeleton no-op; real HTTP deferred to the live-integration phase.**

## Inherited
- **D-12c.1 (from 12c)** — `external_systems.created_by_user_id` is `ON DELETE SET NULL` (preserve the integration record, null the creator); all other external_* FKs cascade.
