# Phase 19 — API Routes / Server Actions

## Routes

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/notifications` | Server Component page | `requireTenant` (+ `(app)` layout operator gate) | Tenant-wide exception queue (PULL) over `getExceptions` |

A nav `<Link href="/notifications">` was added to `src/app/(app)/layout.tsx` (after Review).

## The send seam (`src/lib/integrations/send/`)

| Export | File | Role |
|---|---|---|
| `SendProvider`, `SendRequest`, `SendResult` | `provider.ts` | the channel-agnostic interface + types |
| `ResendProvider` | `resend-provider.ts` | live email via raw `fetch` (`RESEND_API_KEY`); throws at construction without a key |
| `CaptureProvider`, `getCaptured`, `resetCaptured` | `capture-provider.ts` | in-memory no-op (harness); records payloads |
| `getSendProvider()` | `index.ts` | factory: `SEND_CAPTURE=1` or no key → Capture; else Resend |

## Server functions

| Function | File | Behavior | Throws |
|---|---|---|---|
| `sendCommunication({tenantId, commId, actorUserId})` | `src/server/communications.ts` | idempotency guard → transition guard → recipient guard → `resolveSendContent` → `provider.send()` → flip sent/failed + audit | `COMMUNICATION_NOT_FOUND`, `INVALID_DELIVERY_TRANSITION`, `MISSING_RECIPIENT`, `UNRESOLVABLE_SEND_SOURCE` |
| `resolveSendContent(tenantId, comm)` (internal) | `src/server/communications.ts` | resolves subject+body from the source row (`client_update`/`outbound_message`) | `UNRESOLVABLE_SEND_SOURCE` |
| `listVendorNotAccepted(tenantId)` | `src/server/analytics/exceptions.ts` | assignments at status `SENT`, with `ageSeconds` | — |
| `listNteIncreaseRequested(tenantId)` | `src/server/analytics/exceptions.ts` | change orders at `submitted` | — |
| `getExceptions(tenantId)` | `src/server/analytics/exceptions.ts` | composes the two readers + filtered `operationalQueue` → sorted `Exception[]` | — |

## Server Action (`"use server"`)

| Action | File | Signature | Effect |
|---|---|---|---|
| `sendCommunicationAction` | `src/app/(app)/jobs/communication-actions.ts` | `(jobId, commId)` → `CommActionState` | `requireTenant` → `sendCommunication`; maps the 4 errors; `revalidatePath('/jobs/{id}')` + `revalidatePath('/notifications')` |

The job-detail **Send** button (`delivery-transition-buttons.tsx`) was rewired: `to==='sent'` →
`sendCommunicationAction`; all other transitions stay on the pure-flip `updateDeliveryStatusAction`.

## Harness alias (package.json)

| Script | Command |
|---|---|
| `db:check:notifications-send` | `tsx --env-file=.env.local --conditions=react-server scripts/check-notifications-send.ts` |

## Follow-up pass — job follow-up + the 4th exception kind

| Function / action | File | Behavior |
|---|---|---|
| `updateJobAction` (extended) | `src/app/(app)/jobs/actions.ts` | now parses/validates `follow_up_at` (datetime-local → `parseDateTime`) + `follow_up_category`; blank date → clear both; a set date requires a valid category (else returns the pairing error) |
| `updateJob` / `JobPatch` (extended) | `src/server/jobs.ts` | `JobPatch` += `followUpAt` / `followUpCategory`; writes a `job.follow_up_changed` timeline event; a cleared date force-nulls the category |
| `getJobDetail` (extended) | `src/server/jobs.ts` | selects the two new columns (detail render + edit-form prefill) |
| `listFollowUpOverdue(tenantId)` | `src/server/analytics/exceptions.ts` | open-job + tenant scoped; **overdue test + ageSeconds computed in JS** (not SQL `NOW()` — see D-19.17) |
| `getExceptions(tenantId)` (extended) | `src/server/analytics/exceptions.ts` | gains the 4th `Promise.all` reader + a `follow_up_overdue` push loop; same final sort |

Shared pure helpers added (neutral `src/lib/`, importable by both server and the client form):
`src/lib/datetime.ts` (`parseDateTime`, `toLocalInputValue`) and `src/lib/follow-up.ts`
(`FOLLOW_UP_CATEGORIES`, `FollowUpCategory`, `FOLLOW_UP_CATEGORY_LABELS`, `isFollowUpCategory`). The
`/notifications` route is unchanged — it renders the new kind via the existing `ExceptionQueue`
(`KIND_META` gained a purple "Follow-up due" entry).
