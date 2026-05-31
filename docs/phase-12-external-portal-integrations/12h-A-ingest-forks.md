# Phase 12 — 12h-A Ingest Inspection + Forks (security-sensitive; NOT decided)

Inspection for the 12h-B ingest wrapper (`core/ingest.ts` + `src/server/integrations/ingest-external-job.ts`). **No code authored.** The forks below are surfaced for Jonny to resolve before 12h-B.

## Inspection findings

**S1 — `createJob` (the wrap target), jobs.ts:236.**
`createJob(input: CreateJobInput): Promise<JobRow>` — **returns the full `JobRow`** (so `.id` is available for the link row). Accepts `sourceType?` + `sourceExternalId?` (both used: pinned into the insert at lines 312–313). Error set: `CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `LOCATION_CLIENT_MISMATCH`, `PRIORITY_NOT_FOUND` (if priority given), `TRADE_NOT_FOUND` (if trade given), `STATUS_NOT_FOUND`. ONE transaction (counter lock → insert @ **hardcoded NEW** → counter bump → `job_status_history` null→NEW → `job_events` job.created → `auditLogs` job.created → optional NTE event). **Requires** `tenantId`, `clientId`, `clientLocationId` (internal ids), `problemDescription`, `createdByUserId`.

**S2 — wrapper precedent, `createClientJob` (create-client-job.ts).** Thin guard+delegate: validates scope (`clientScope.has(clientId)`), re-validates location belongs to the client (`getLocation` → `location.clientId === clientId`), then calls `createJob` with `sourceType` **pinned server-side** + `createdByUserId` from the authenticated actor. Returns `createJob`'s result. This is the exact shape 12h-B mirrors — **the wrapper is the sole authz/pinning gate.**

**S3 — status-transition path (F7's "mapped transition") — ⚠ KEY FINDING.** **There is NO generic status-transition helper.** `grep` for `transitionJobStatus`/`updateJobStatus`/`changeJobStatus`/`setJobStatus`/`advanceJobStatus` → **NONE-FOUND**. `job_status_history` is written by exactly three domain-specific writers: `createJob` (null→NEW), `dispatch.ts sendDispatch` (NEW/SCHEDULED→DISPATCHED), `billing/close.ts markBillingClosed` (→CLOSED_BILLED). Each writes its history row inline within its own transaction. So F7's "createJob then mapped-status transition" has **no canonical fn to call** — this elevates F7 into a real fork (see IF-6).

**S4 — tenant source + link-insert idiom.** `external_systems.tenant_id` is **NOT NULL, FK→tenants CASCADE** — so ingest derives `tenantId` from the `external_systems` row (ingest is keyed by an `external_systems.id` → its `tenant_id`). The `external_work_order_links` PK has `$defaultFn(() => uuidv7())`, so the link row can be inserted without an explicit id (or pass `uuidv7()` explicitly, like `createJob` does for jobs). Tenant on the link row = the system's tenant (defense-in-depth: it must equal the created job's tenant).

## Forks (resolve before 12h-B)

**IF-1 — Unmapped-code policy.** When `resolveStatus/Trade/Priority` returns `matched:false` at ingest:
(a) reject the WO; (b) ingest with a default (status stays NEW, trade/priority null) + write a `sync_event` flagging the unmapped code for operator review; (c) ingest but set `link_status` to a review flag.
*Evidence:* mapping returns `matched:false` by design (12g); roadmap forbids silent drop. *Leaning (not decided):* (b) — ingest-with-default + sync_event, since createJob already tolerates null trade/priority and NEW is the natural landing; rejecting a WO over an unmapped priority is heavy-handed. **Status is the subtle case** — see IF-6.

**IF-2 — Location resolution (the hard gap).** `createJob` requires an **internal** `clientLocationId` (+ a `clientId`), but a `NormalizedWorkOrder` carries only a `clientLocationRef` **string** from the provider — and **there is no `external_location_mappings` table** (0029 mapped only status/trade/priority). So: how does ingest resolve a provider location ref → an internal `client_location_id` + its `client_id`?
Options: (a) a new location-mapping table (scope creep — a 4th mapping type, new migration); (b) the `external_account` / `external_system` config carries a fixed default client+location for MVP (all WOs from one system → one client/location); (c) match by a convention (e.g. `client_locations.location_code` == the provider ref) with no new table.
*Evidence:* createJob errors `CLIENT_NOT_FOUND`/`LOCATION_NOT_FOUND`/`LOCATION_CLIENT_MISMATCH`; no location mapping exists. **This is the biggest unresolved dependency — createJob cannot be called without a real `client_location_id`.** Must be decided before 12h-B.

**IF-3 — Dedup on re-sync (the ewol unique).** On re-sync of an already-linked WO (`UNIQUE(external_system_id, external_wo_id)` already present): (a) skip (no-op, update `last_synced_at` only); (b) update the linked job; (c) upsert.
*Evidence:* the 0030 unique; re-sync is the normal polling case. *Leaning:* (a) skip-and-touch for MVP (ingest creates only on first sight; updates to existing jobs are a later slice) — but confirm.

**IF-4 — Idempotency / txn boundary.** `createJob` (its own txn) + the `ewol` link insert + (if any) the mapped-status transition — one outer txn or sequenced with compensation? `createJob` already commits its own txn internally and returns, so wrapping it in an outer txn isn't possible without refactoring it (frozen). Options: (a) sequence: createJob → then insert link (+ transition) in a second txn, with a guard that an orphaned job (created but unlinked) is detectable/repairable; (b) insert link first (status=active, job_id null), then createJob, then update link.job_id.
*Evidence:* Phase-10 in-txn audit discipline; but createJob is a self-contained txn (frozen — can't edit). *Leaning:* (a) createJob-first, then link insert, with the `ewol` unique as the idempotency guard on retry. Surface the orphan-window tradeoff.

**IF-5 — Live adapter vs mock-input entry for 12h-B.** Build only the generic `core/ingest.ts` (takes a hand-built `NormalizedWorkOrder`) + server wrapper, with **no live adapter call** — deferring real `fetchWorkOrders` to the ServiceChannel skeleton (12j/12i)?
*Evidence:* 12j is the adapter skeleton; ingest is fully testable with a constructed `NormalizedWorkOrder`. *Leaning:* yes — ingest takes a `NormalizedWorkOrder` directly; the adapter wiring (`getAdapter(provider).fetchWorkOrders`) is a thin 12i/12j concern.

**IF-6 — (NEW, from S3) How to apply the mapped status (F7).** Since no generic transition helper exists: (a) ingest lands at NEW only and does **not** apply a mapped status in MVP (mapped status deferred until a transition helper exists) — simplest, preserves R-5.8 by doing nothing collateral; (b) 12h-B writes the mapped-status transition inline (status update + `job_status_history` row + event), effectively authoring the first generic transition for this path; (c) build a small shared `transitionJobStatus` helper now and use it (broader scope, benefits later phases).
*Evidence:* S3 — `createJob` hardcodes NEW; the only transitions are domain-specific inline writers; R-5.8 says no silent/collateral status changes. *Leaning:* (a) for MVP (ingest = create-at-NEW; the WO's external status is recorded via the mapping/sync layer, and an operator/their workflow advances it) — but this **contradicts F7's literal "then mapped transition,"** so it needs Jonny's explicit call. If (b)/(c), the transition must write history (not a raw update) to honor R-5.8.

## Cross-cutting note
IF-2 (location) and IF-6 (status transition) are the two that **block** 12h-B authoring — createJob literally cannot run without a resolved `client_location_id` (IF-2), and F7's transition has no helper (IF-6). IF-1/IF-3/IF-4/IF-5 shape behavior but have workable leanings.

---

## Resolutions (locked) — 12h-A.1, 2026-05-30

- **IF-1 LOCKED** — unmapped code → ingest with a sensible default + write an `external_sync_events` row flagging it for operator review. Never reject the WO, never silently drop.
- **IF-2 LOCKED** — new **`external_location_mappings`** table (**migration 0031**): `(external_system_id, external_code) → client_location_id`; **tenant-scoped**; durable both-direction (inbound resolve + outbound reference). Table now; operator population UI deferred (later admin/operator-portal phase).
- **IF-3 LOCKED** — re-sync of an already-linked WO → **skip + touch `last_synced_at`**; no duplicate job (the `ewol` unique enforces).
- **IF-4 LOCKED** — **createJob-first** (it's a frozen self-contained txn) → **then** the `ewol` link insert; the `ewol` unique `(external_system_id, external_wo_id)` is the idempotency guard. The **orphan window** (job created before the link row lands) is a **KNOWN LIMITATION** — record in `10-known-limitations.md` at closeout.
- **IF-5 LOCKED** — 12h-B builds the **generic ingest over a hand-built `NormalizedWorkOrder`**; live adapter fetch deferred to 12j.
- **IF-6 LOCKED (revises F7)** — external jobs **land at NEW** (like all intake); the mapped status is **RESOLVED + RECORDED** (on the link row / a `sync_event`) for operator triage; **NO auto status-transition**. **F7's "then mapped transition" is SUPERSEDED** — no shared transition helper exists (12h-A S3), and NEW-then-triage is the platform's established intake pattern (Phase 11 client-portal precedent).

### F7 revision note
The 12b-locked F7 ("ingest = createJob (NEW) → explicit mapped-status transition") is **revised by IF-6**: ingest stops at NEW and records the mapped status for triage rather than auto-transitioning. Rationale: S3 found no generic `transitionJobStatus` helper (status changes are domain-specific inline writers only), and auto-advancing on intake would be a collateral status change at odds with R-5.8 (explicit-transitions). The external status is preserved via the mapping + sync/log layer; an operator (or a future transition helper) advances it deliberately.

### Migration-plan addendum
IF-2 adds **migration 0031** (`external_location_mappings`) — a 4th mapping table, not in the 12b 0028/0029/0030 grouping. It gets its own SHOW-CREATE inspect + sandbox→prod gate (12h.0), authored before 12h-B (the ingest wrapper depends on the location resolver this table backs).

---

## Multi-client resolution (locked) — 12h-A.2, 2026-05-30

**CONTEXT:** ServiceChannel / Corrigo are **multi-client platforms** — one connection (one `external_system`) carries hundreds of clients. Per the ServiceChannel API docs: **SubscriberId** = the client; **LocationId** = a globally-unique location; **StoreId** = a per-subscriber location code ("not as unique as LocationId — include SubscriberId with StoreId"). This confirms **location codes are unique only WITHIN a client** — so the 0031 location mapping's `UNIQUE(external_system_id, external_code)` is insufficient for a multi-client system, and a **client** resolution layer is required ahead of location.

- **D-12h.1 LOCKED (migration 0032)** — new **`external_client_mappings`** table: `(external_system_id, external_code) → client_id`; **tenant-scoped**; `direction` enum default `'both'`. `external_code` = the platform's client id (ServiceChannel **SubscriberId**; Corrigo equivalent).
- **D-12h.2 LOCKED (migration 0032)** — **add `client_id` to `external_location_mappings`**; replace the unique with **`(external_system_id, client_id, external_code)`** (StoreId is per-client). FK `client_id → clients` CASCADE. The table is **empty in prod** → a safe additive change (NOT a populated-table migration). *(Note: 0032 alters the just-created 0031 table — both land before 12h-B, so no production data is affected.)*
- **IF-7 LOCKED** — an **unmapped CLIENT** (a SubscriberId with no mapping) → **PARK the WO**: write `external_sync_events` (`event_type=error`, "unmapped client code &lt;x&gt;") + `external_payload_logs` (preserve raw); do **NOT** create a job, do **NOT** auto-create a client. The operator maps the client in client-profile/UI settings (UI deferred; the 0032 mapping row is what enables it). **ASYMMETRIC by design** vs location: an unmapped *client* parks the WO; an unmapped *location* auto-creates a stub (prior decision) — but only **under an already-mapped client**.

### Ingest resolution order (top-down, for 12h-B)
1. **resolve client** (SubscriberId → client_id) → unmapped ⇒ **park** (IF-7: sync_event error + payload_log; stop).
2. **resolve location within client** (StoreId/LocationId → client_location_id) → unmapped ⇒ **auto-create stub `client_location` + auto-create the location mapping + flag for operator review**.
3. **resolve status / trade / priority** → unmapped ⇒ **sensible default + `sync_event` flag** (IF-1).
4. **createJob at NEW** (IF-6) → **ewol link** (IF-4) → **sync_event(s)**.

### Adapter note (for 12j, banked)
`normalizePayload` prefers **LocationId** (global) else **StoreId** (per-client) as the location `external_code`; **SubscriberId** as the client `external_code`. This field-selection is **ADAPTER logic, NOT core** (§2.1) — core/mapping resolves whatever codes the adapter supplies.

### Migration-plan addendum (revised)
A **5th migration 0032** now precedes 12h-B: `external_client_mappings` (new) + `external_location_mappings` `client_id` addition (D-12h.2). It gets its own inspect + sandbox→prod gate (12h.0b). The full Phase-12 migration set is now **0028 / 0029 / 0030 / 0031 / 0032**.

---

## Ingest-authoring blockers + resolutions (12h-B Step-1 / 12h-B.0), 2026-05-30

12h-B Step-1 inspection surfaced two falsified assumptions; both resolved (a):

- **SF-1 LOCKED (a)** — `createJob` and `createLocation` both **require `createdByUserId: string`** (non-null TS contract), and a codebase search found **no system/service-user convention** (every writer attributes to a real user). Resolution: a **dedicated system/integration user** owns all system-originated ingest records (`createdByUserId` = the system user id). No frozen-code change. The user is **GLOBAL** (a plain `users` row; `createJob.createdByUserId` is an FK→users, not tenant-scoped — no `tenant_users` membership required for attribution). Surfaced in the UI as the integration's identity.
- **SF-2 LOCKED (a)** — `client_locations` has 5 NOT NULL cols (`name`, `address_line1`, `city`, `state_province`, `postal_code`) the `NormalizedWorkOrder` couldn't supply. Resolution: **extend `NormalizedWorkOrder`** with optional `locationName`, `addressLine1`, `city`, `stateProvince`, `postalCode` (+ `country?`); the adapter fills them from the provider payload (ServiceChannel WO carries address). The auto-stub uses real payload data; a genuinely-absent required field gets a clearly-marked needs-completion placeholder **plus** a hard `needs_location_completion` flag (NOT inventing — carrying real data, marking the gap when data is truly missing). *(NormalizedWorkOrder extension lands in 12h-B proper, in core/types.ts.)*

### System-user creation mechanism (sub-decision, flagged for objection)
The seed precedent creates users via better-auth `auth.api.signUpEmail` — but that is a **login** user (it also writes an `accounts` row with a password). A service identity never authenticates, so 12h-B.0 creates the system user via a **direct `users` insert** (`id=uuidv7()`, `email='integration@system.internal'`, `name='Integration Service'`, `emailVerified=true`, **no account/password row**). This is a deliberate deviation from the login-user seed pattern, appropriate for a non-authenticating service account; flagged here for review. Resolver `getSystemUserId()` + `SYSTEM_USER_EMAIL` live in `src/server/integrations/system-user.ts`; the seed is `scripts/seed-system-user.ts` (idempotent, find-by-email). Seeded sandbox now; prod-gated.
