# Phase 12 — 12i-A Outbound Sync / Orchestration Inspection + Forks (NOT decided)

Inspection for 12i-B (`core/sync.ts` — generalized run/event/payload orchestration + the outbound status-push path). **No code authored.** Forks IO-1..IO-5 surfaced for Jonny.

## Inspection findings

**S1 — internal status-change surface (the push TRIGGER).** Confirms 12h-A S3: **no central transition fn.** `job_status_history` is written by three domain-specific inline writers, each inside its own txn — `createJob` (null→NEW, jobs.ts), `sendDispatch` (NEW/SCHEDULED→DISPATCHED, dispatch.ts:443), `markBillingClosed` (→CLOSED_BILLED, billing/close.ts). There is **no seam** a push could hook centrally.
**KEY FIND:** **`portal_update_queue` already exists** (`schema/portal-updates.ts`, Phase-6 6f schema-only forward-decl) — its documented purpose is *"a generic queue for outbound portal updates (status, notes) to external systems — Phase 12/13 drains it."* Columns: `id, tenant_id, job_id, target_type varchar(32), status varchar(32) default 'pending', payload_json text, attempts int default 0, last_attempt_at, created_by_user_id, timestamps`. **No writer/reader exists yet** (forward-decl). Note: it is **job-scoped, NOT external_system-scoped** (no `external_system_id` column) — a nuance for IO-1.

**S2 — credentials + no-leak surface.** `external_credentials` (schema/external-systems.ts:106): `credential_type varchar(64)`, **`encrypted_payload text` (nullable)**, `key_ref varchar(255)`, `expires_at datetime`, `status enum(active/inactive/revoked)`. **Nothing reads credentials anywhere** (`grep` outside schema → NONE) — F1's "skeleton writes no live secret" holds. The ingest `payload_log` writer (12h-B) logs only `wo.raw` (the inbound provider body) with `direction='inbound'` — **never a credential**.

**S3 — adapter + mapping outbound plumbing.** `PortalAdapter.pushStatus(account: ExternalAccount, push: NormalizedStatusPush): Promise<PushResult>` (types.ts) — `NormalizedStatusPush` is **`{ externalWoId, externalStatusCode, note? }`** (status+note ONLY — OQ-6 at the type level; cannot express cost/markup). `mapping.ts` `resolveStatus({ direction })` supports **`direction='outbound'`** (→ matches `outbound`/`both`). `registry.getAdapter(provider)` resolves the adapter (throws `UNKNOWN_PROVIDER` if unregistered — the skeleton isn't registered until 12j). Outbound plumbing is fully present; only the live adapter body is missing.

**S4 — per-ingest sync_run shape (to generalize).** 12h-B's `ingestWorkOrder` opens a run inline: `db.insert(externalSyncRuns).values({ id, tenantId, externalSystemId, runType })` (status defaults 'running', startedAt now); logs payload (`externalPayloadLogs`); has a local `finalizeRun(status, counts, errorSummary)` closure that updates `status`/`finishedAt`/`counts`/`errorSummary`; and inserts `externalSyncEvents` per item. **This open / log-payload / log-event / finalize quartet is exactly what `core/sync.ts` should extract** so both ingest and outbound push share it.

## Forks (resolve before 12i-B)

**IO-1 — push trigger.** No central transition seam (S1). Options:
(a) **explicit on-demand** — caller invokes `pushStatusToExternal(jobId, …)`; no auto-hook into the 3 inline writers;
(b) **hook each inline writer** to enqueue a push (edits frozen Phase-4/5/8 writers — surfaces a frozen-code change);
(c) **drain `portal_update_queue`** — something enqueues a row (status change → queue), a 12i drainer reads pending rows and pushes. The queue table already exists for exactly this (S1 KEY FIND).
*Evidence:* 3 inline writers, no seam; `portal_update_queue` is a documented Phase-12/13 drain target but is job-scoped (no external_system_id — the drainer would resolve the system via the job's ewol link). *Lean (not decided):* (a) for 12i-B's generic path (an explicit `pushStatusToExternal` that resolves system via ewol, maps status outbound, calls adapter, logs a run) + **bank the queue-drain (c) as the eventual auto path** — but (c)'s enqueue-side still needs a trigger, which loops back to the same no-seam problem. Your call on whether 12i-B builds (a) only, or (a)+(c) wiring.

**IO-2 — credential handling in the skeleton.** F1 deferred real secrets (S2: nothing reads creds). Options:
(a) push path calls a `getCredentials(externalSystemId)` that returns the record now (encrypted_payload is NULL in the skeleton — no decryption), real decryption deferred to the first live adapter;
(b) skeleton `pushStatus` is a no-op stub that never touches creds yet.
**HARD RULE either way:** credentials NEVER enter `payload_log` or any log/event. *Lean:* (b) for the skeleton (no live push → no cred need), with `getCredentials` authored but unused-until-12j — but confirm.

**IO-3 — `sync.ts` scope (refactor vs duplicate).** Extract shared `openRun` / `finalizeRun` / `logEvent` / `logPayload` from the inline ingest quartet (S4) and **refactor `core/ingest.ts` to use them**, vs duplicate the shape in the outbound path. *Evidence:* ingest already has the exact shape inline. *Lean:* extract + refactor ingest (one source of truth for run/event/log) — but that re-touches the just-committed `ingest.ts` (792082d), so it's a deliberate refactor to flag.

**IO-4 — outbound payload_log content (redaction boundary).** The push logs the `NormalizedStatusPush` (status+note only, OQ-6) + the adapter's `PushResult` (ok/externalRef/error), `direction='outbound'`. **Explicitly NOT:** credentials, cost, markup, margin, invoice data. *Confirm the redaction boundary* — the typed `NormalizedStatusPush` already makes margin un-expressible; IO-4 just affirms the log writes the push + response, nothing more.

**IO-5 — live push vs logged no-op for 12i-B** (mirrors inbound IF-5). *Lean:* generic path + **skeleton adapter no-op** (`getAdapter` returns the 12j skeleton whose `pushStatus` returns a stub `PushResult`); real HTTP deferred to 12j. The run/event/payload logging is real; only the network call is stubbed.

## Cross-cutting note
IO-1 (trigger) is the only structural fork — the rest (IO-2/3/4/5) have clear leanings. The `portal_update_queue` discovery means the *eventual* auto-drain path has a home, but its enqueue-side trigger hits the same no-central-transition wall (S1) that IF-6 already navigated inbound (NEW-then-triage). 12i-B can ship the **explicit generic push + shared sync helpers + skeleton no-op adapter** and bank the queue-drain auto-path, OR also wire the queue — Jonny's call on IO-1.

---

## Outbound resolutions (locked) — 12i-A.1, 2026-05-30

MVP does **not** integrate live, but **builds the generic outbound path now** (wired no-op); auto-push-on-change is the full-workflow target, carried forward.

- **IO-1 LOCKED** — build the generic outbound path: `core/sync.ts` orchestration + an explicit **`pushStatusToExternal(jobId)`** entry. Resolves the external system via the job's `external_work_order_links` row, resolves the outbound status mapping (`resolveStatus` direction='outbound'), calls the adapter, logs run/event/payload. **Invocation EXPLICIT for MVP — NO auto-hooks into the frozen status/note writers.** (`portal_update_queue` exists but auto-drain deferred.)
- **IO-2 LOCKED** — skeleton adapter `pushStatus` = **logged no-op; loads NO credentials**. HARD RULE: credentials never enter `external_payload_logs` (or any log/event).
- **IO-3 LOCKED** — extract `openRun` / `finalizeRun` / `logEvent` / `logPayload` into `core/sync.ts`; **refactor `core/ingest.ts` (792082d) to consume them** (DRY — inbound + outbound share one run/log substrate).
- **IO-4 LOCKED** — outbound `payload_log` = the `NormalizedStatusPush` (status+note only, OQ-6) + the `PushResult`, `direction='outbound'`. **Never** credentials/cost/markup/margin.
- **IO-5 LOCKED** — generic path + skeleton no-op adapter; real HTTP deferred to 12j.

### CF-12.x — FULL-WORKFLOW auto-push (post-MVP; banked for the integration phase)
When live integration is enabled, **ANY client-relevant job change — a status change OR a client-visible note — auto-pushes** to the mapped external platform. Requires: `pushNote` on the adapter interface (alongside `pushStatus`); **scope-guarded enqueue hooks** in `createJob` / `sendDispatch` / `markBillingClosed` + the client-visible-note writer; **auto-drain** of `portal_update_queue`. **NOT built for MVP** (no live integration). MVP ships the generic outbound path + skeleton no-op; this CF is the activation work. *(→ closeout-carryforwards.md.)*

### Scope guard (12i-B)
12i-B touches **NO frozen writer**. `core/sync.ts` is new; the ingest refactor (IO-3) touches **only our own `792082d` file** (`core/ingest.ts`). Any need to edit a frozen writer (createJob/sendDispatch/markBillingClosed/note writers) is a **HALT-and-surface**, not a quiet edit.
