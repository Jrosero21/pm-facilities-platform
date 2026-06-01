# Phase 19 — Design Proposal (Notification Center + Exception Queue + Live Send Backend)

**Phase:** 19 — Notification Center + Exception Queue + Live Send Backend (v2.2.0-phase-19).
**Branch:** `phase-19-notifications-send` (off `main@db95ac9`).
**Status:** design proposal — awaiting review before slicing. Builds nothing.

Phase 19 is the **nervous system** of "manage by exception" (roadmap §2.7) plus the platform's
**first real outbound send provider**. It is **detection + surface + send MECHANISM** only. This doc
is firmed against the 19a inspection (`send substrate present, provider absent`; the delivery state
machine lives on `communication_logs`; timezones do not exist in schema).

---

## 1. Scope & Non-Goals

### In scope
- **Live send backend** — `Resend`, email-only, behind a channel-agnostic `SendProvider` adapter (+ a
  `CaptureProvider` for the harness). Wired into the **existing** `communication_logs` delivery flip.
- **Provider-tracking columns** — `provider_message_id`, `attempts`, `last_error` on
  `communication_logs` (migration 0042).
- **TZ column (data-model only)** — an IANA `timezone` on the location model (0042); nothing consumes
  it in Phase 19 (it's the seam the business-hours clock will use later).
- **Exception detection** — reuse `operationalQueue` signals (overdue / stalled /
  unassigned-high-priority) + two net-new readers (vendor-not-accepted, NTE-increase-requested),
  composed by a `getExceptions(tenantId)` reader.
- **Notification center + exception queue UI** — one operator surface under `(app)/`, PULL.

### Non-goals (with the owning phase)
| Not in Phase 19 | Owner |
|---|---|
| Auto-response / auto-re-dispatch to vendor B on decline/ghost/timeout | **Phase 28** |
| Autonomous sending (an agent sends without a human) | **Phase 23** (policy engine) |
| Business-hours **elapsed-time** logic (the actual clock math) | **banked CF-19.1** (TZ column ships now; logic later) |
| SMS / Twilio live wiring | **banked CF-19.2** (the `SendProvider` interface is channel-agnostic so it slots in) |
| no-same-day-on-site-confirmation detection | **banked CF-19.3** (depends on the business-hours clock) |
| Real-time browser push / websockets | out of scope — the "push surface" is a PULL queue (see §5) |

---

## 2. The Send Adapter

### 2.1 `SendProvider` interface (channel-agnostic)
Lives in `src/lib/integrations/send/` (beside `src/lib/integrations/servicechannel/` and the existing
inbound `src/lib/integrations/email/`). A minimal, channel-agnostic contract so SMS slots in later:

```ts
// src/lib/integrations/send/provider.ts  (shape only — not yet written)
export type SendChannel = "email" | "sms";
export type SendRequest = {
  channel: SendChannel;
  to: string;                 // recipient_email (or recipient_phone for sms later)
  subject?: string | null;    // email only
  body: string;
  idempotencyKey: string;     // = communication_logs.id (see §2.4)
};
export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

export interface SendProvider {
  readonly name: string;                       // "resend" | "capture"
  send(req: SendRequest): Promise<SendResult>;
}
```

### 2.2 `ResendProvider` (real)
`src/lib/integrations/send/resend-provider.ts` — reads `process.env.RESEND_API_KEY` with the same
presence-check pattern as `llm-routing.ts` (`AI_GATEWAY_API_KEY` / `ANTHROPIC_API_KEY`). If the key is
absent it throws at construction (fail-closed). `send()` calls Resend's HTTP API, maps the response to
`{ok, providerMessageId}` / `{ok:false, error}`. The Resend `idempotency-key` header is set from
`SendRequest.idempotencyKey`.

### 2.3 `CaptureProvider` (harness / no-op)
`src/lib/integrations/send/capture-provider.ts` — in-memory, sends nothing. Records each `SendRequest`
in an internal array and returns a **synthetic** `providerMessageId` (e.g. `capture:<idempotencyKey>`).
The phase-blocking harness uses this so the full send path is exercised **without real email**. A test
helper exposes the captured payloads for assertions.

### 2.4 Slotting into the existing flip (no new send table)
Today's "Send" is `updateCommunicationDeliveryStatus` (`src/server/communications.ts:169`) — a pure DB
flip validated by `isLegalDeliveryTransition`. Phase 19 adds a **send function** that wraps it:

```
sendCommunication({tenantId, commId, provider}):
  1. load communication_logs row (tenant-scoped) → COMMUNICATION_NOT_FOUND
  2. IDEMPOTENCY GUARD (§2.6): if delivery_status='sent' OR provider_message_id IS NOT NULL
       → return early, DO NOT call provider (no double-send)
  3. assert isLegalDeliveryTransition(current, 'sent')        (draft→sent or queued→sent)
  4. resolve recipient (recipient_email) + body (+ template render if template-sourced)
  5. result = await provider.send({channel:'email', to, subject, body, idempotencyKey: commId})
  6a. ok    → UPDATE delivery_status='sent', sent_at=NOW(), provider_message_id=result.id, attempts+1
  6b. error → UPDATE delivery_status='failed', last_error=result.error, attempts+1
  7. writeAuditLog('communication.sent' | 'communication.send_failed', {commId, jobId, provider:name})
```
The manual flip stays available (operator can still mark statuses by hand); the **send** path is the
new provider-backed route. The operator "Send" button is rewired to call `sendCommunication` with the
configured provider.

### 2.5 Idempotency (§2.6)
Two layers: (a) the **pre-call guard** in step 2 — a row already `sent` / already carrying a
`provider_message_id` short-circuits before the provider is touched; (b) the provider-level
**idempotency key** = `communication_logs.id`, so even a race that passes the guard cannot make Resend
deliver twice. `attempts` increments on every send attempt for observability. A retry of a `failed`
row is allowed (`failed→sent` is a legal transition) and is **not** blocked by the guard (no
`provider_message_id` yet).

---

## 3. Migration 0042 Plan (the first v2 migration)

**One migration, additive columns only, no new tables, no FK changes.**

### 3.1 `communication_logs` — provider tracking
```ts
providerMessageId: varchar("provider_message_id", { length: 255 }),   // nullable
attempts:          int("attempts").notNull().default(0),
lastError:         text("last_error"),                                 // nullable
```
Recommended index: `cl_tenant_status_idx (tenant_id, delivery_status)` already exists and backs the
"find sendable drafts" query — no new index required.

### 3.2 Location timezone (data-model only)
Add to **`client_locations`** (the location-level anchor — recommended over `client_location_hours`,
which is per-day-of-week; the timezone is a property of the place, not the day):
```ts
timezone: varchar("timezone", { length: 64 }),   // nullable, IANA e.g. 'America/Los_Angeles'
```
Nullable, **no logic consumes it in Phase 19**. The backfill + the business-hours elapsed function are
banked (CF-19.1) with the clock work. (19a confirmed: no timezone column or `timezones` table exists
anywhere today — this is the seam.)

### 3.3 Cadence
`pnpm db:generate` produces `0042_*.sql` (next-free is 0042, confirmed). Then the standard migration
cadence: **sandbox apply → `-E` contract-verify (column presence/types) → HALT for prod confirm →
prod apply → commit**. Each as its own gated action.

---

## 4. Exception Detection

### 4.1 Reuse (no new reader)
`operationalQueue(tenantId, limit)` already classifies and returns per-job `isOverdue`, `isStalled`,
`isUnassignedHighPriority`, `urgencyTier`. The first three exception kinds are **read off this feed** —
no new SQL. (Note: these are **wall-clock** today — Option B: detection ships on wall-clock; the
TZ-aware refinement is banked.)

### 4.2 Net-new readers (tenant-scoped)
```ts
// vendor-not-accepted: dispatched to a vendor but not yet accepted, past a dwell threshold.
// "not accepted" = job_vendor_assignments.current_status code = 'SENT' (category 'pending').
// DRAFT (not yet sent) is NOT an exception; ACCEPTED/DECLINED/etc are resolved.
listVendorNotAccepted(tenantId, thresholdSeconds = <TBD>): Promise<VendorNotAcceptedRow[]>
  // join job_vendor_assignments → dispatch_assignment_statuses (code='SENT')
  //   → jobs → clients (label), dwell = NOW() - assignment sent/updated time
  // returns { assignmentId, jobId, jobNumber, clientName, vendorId, vendorName, sentAt, ageSeconds }

// NTE-increase-requested: a change order awaiting a human decision.
// "increase requested" = change_orders.status = 'submitted'.
listNteIncreaseRequested(tenantId): Promise<NteIncreaseRow[]>
  // change_orders (status='submitted') → jobs → clients (label)
  // returns { changeOrderId, jobId, jobNumber, clientName, total, reason, submittedAt }
```
Both filter on `tenant_id` first (tenant-scoped by construction).

### 4.3 The composing reader
```ts
getExceptions(tenantId): Promise<Exception[]>
  // Exception = discriminated union on `kind`:
  //   | { kind: 'overdue' | 'stalled' | 'unassigned_high_priority', ...QueueEntry fields }
  //   | { kind: 'vendor_not_accepted', ...VendorNotAcceptedRow }
  //   | { kind: 'nte_increase_requested', ...NteIncreaseRow }
  // composes operationalQueue (filtered to the 3 kinds) + the 2 net-new readers,
  // returns one tenant-wide list sorted by urgency/age. New kinds slot in without UI change.
```
**Recommendation: a single composing `getExceptions` reader** returning a discriminated union — the UI
renders one unified, sorted list and future exception kinds (no-same-day-on-site, spend-ceiling,
low-confidence-draft) drop in by extending the union, not the surface.

---

## 5. Surfaces

### 5.1 Route + nav
**Recommend `/notifications`** (the "notification center" is the durable surface; the exception queue
is its primary content/first feed, with room for future notification kinds — autonomy events,
spend-ceiling hits, low-confidence drafts). A new `(app)/notifications/page.tsx` Server Component
(`requireTenant`, mirroring `/review`) + one nav `<Link href="/notifications">` after Review, sibling
className verbatim. (Tabbing — e.g. "Exceptions" — follows the Phase-18 `?tab=` pattern if a second
feed lands.)

### 5.2 PULL, not push (anti-scope-creep)
The roadmap's "push surface for exceptions" means **the queue surfaces exceptions to the operator**, not
browser push / websockets / real-time. Phase 19 is a **PULL** surface (operator navigates to
`/notifications`), consistent with Phase 18. No realtime infra. Stated explicitly to prevent scope creep.

### 5.3 The send UI
No new compose surface — the **existing** communication/draft surfaces (job-detail Communications, the
`/review` publish action) get a real **Send** that now calls `sendCommunication` (the adapter) instead
of a bare status flip. The operator action (`updateDeliveryStatusAction` / a new `sendCommunicationAction`)
triggers the provider; the result (sent/failed + provider id) shows via the existing
`DeliveryStatusBadge`.

---

## 6. Slice Breakdown (provisional — each independently verifiable)

| Slice | Content | Verify |
|---|---|---|
| **19b** | Migration 0042: provider columns (`communication_logs`) + `timezone` (`client_locations`). | sandbox apply → `-E` contract-verify → HALT for prod confirm → prod apply |
| **19c** | `SendProvider` interface + `ResendProvider` + `CaptureProvider` + `sendCommunication` wired into the flip + idempotency guard. | tsc/build; harness group A/B (later) |
| **19d** | Exception readers (`listVendorNotAccepted`, `listNteIncreaseRequested`) + `getExceptions` composing reader. | tsc/build; harness group C |
| **19e** | `/notifications` route + exception queue UI + send-trigger rewire + nav `<Link>`. | tsc/lint/build; `/notifications` present |
| **19f** | Harness (`check-notifications-send.ts`) + 11 docs + closeout-carryforwards + gated tag/ff-merge/push. | green ledger; doc gate |

Order/merge is provisional — each slice gets its own inspect-confirm sub-batch. 19b (the migration)
comes first because 19c's idempotency guard reads `provider_message_id`.

---

## 7. Harness Strategy

`scripts/check-notifications-send.ts` via `db:check:notifications-send`, **sandbox-only**, self-seed +
teardown, mirroring `check-operator-review.ts`. The **`CaptureProvider` is what keeps it honest** — the
real `ResendProvider` is **never constructed** in the harness path (asserted).

| Group | Proves |
|---|---|
| **A — send path (CaptureProvider)** | compose → `sendCommunication(provider=capture)` → row flips `draft→sent`, `provider_message_id` stored, `sent_at` set, exactly one payload captured, **no real provider called**. |
| **B — idempotency (§2.6)** | a 2nd `sendCommunication` on an already-`sent` row returns early, captures **0** new payloads, `attempts` does not double-send; a `failed` row CAN be retried (`failed→sent`). |
| **C — exception readers** | `listVendorNotAccepted` returns only `SENT`-status assignments (not DRAFT/ACCEPTED); `listNteIncreaseRequested` returns only `submitted` change orders; `getExceptions` unions them; **cross-tenant isolation** (T-B rows never surface for T-A). |
| **D — write-boundary** | a send moves only `communication_logs` (1 row: status+provider_id+sent_at) + `audit_logs` (+1); it does NOT touch `client_update_logs`, `outbound_messages`, jobs, or any operational table. |
| **E — provider safety** | assert `ResendProvider` is not instantiated and `process.env.RESEND_API_KEY` is not required for the harness to pass (capture path only). |

---

## 8. Open Questions / Forks (resolve before building)

1. **Provider columns on `communication_logs` vs reusing `portal_update_queue` mechanics.**
   **Recommend: add to `communication_logs`.** It is already the delivery state machine with
   `channel`/`recipient_email`/`delivery_status`; `portal_update_queue` is portal-targeted (no email
   channel, no recipient email) and would split one delivery record across two tables. Three additive
   columns keep the record whole.
2. **`/notifications` vs `/exceptions` route name.**
   **Recommend: `/notifications`.** "Notification center" is the durable surface that will host more
   than exceptions (autonomy events, spend-ceiling hits); the exception queue is its first feed.
3. **`getExceptions` composing reader vs per-kind readers surfaced separately.**
   **Recommend: one composing `getExceptions` returning a discriminated union.** One unified operator
   list, one sort, and future kinds extend the union — not the UI.

---

## Verification posture (for the eventual closeout)

`pnpm run db:check:notifications-send` → green (groups A–E). `tsc --noEmit` → 0; `lint` → 0 errors;
`build` → `/notifications` present. Migration 0042 contract-verified in sandbox before any prod apply.
Phase 19 is **NOT** migration-free (unlike Phase 18) — 0042 adds the provider columns + the TZ seam.
