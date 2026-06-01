# Phase 19 — Closeout

## Goal

Build the platform's **first real outbound send backend** (Resend behind a `SendProvider` adapter,
capture-by-default) and a tenant-wide **exception queue** (`/notifications`) — the "manage by exception"
nervous system the Phase-18 "no outbound" boundary pointed at. On the **first v2 migration (0042)**, additive.

## Completed deliverables

- **Live send backend** — `sendCommunication` wraps the delivery flip (compose → resolve source content
  → `provider.send()` → flip sent/failed + audit), two-layer idempotent (§2.6). `SendProvider` seam:
  `ResendProvider` (live, raw fetch) + `CaptureProvider` (harness) + `getSendProvider` factory.
- **Exception detection** — `getExceptions` (vendor-not-accepted `SENT` + NTE-increase `submitted` +
  filtered `operationalQueue`), one sorted discriminated union.
- **`/notifications`** — PULL exception-queue surface + nav link; the job-detail **Send** button rewired
  through the real (capture) send path.
- **Migration 0042** — `communication_logs` += provider tracking; `client_locations` += `timezone` seam.
- A **29-assertion phase-blocking harness**, green on two clean runs.

## Files created / changed (commits `a2b7b0c` migration · `8737944` feature · `b59a845` harness+docs)

- `src/lib/integrations/send/` — `provider.ts`, `resend-provider.ts`, `capture-provider.ts`, `index.ts` (19c).
- `src/server/communications.ts` — `resolveSendContent` + `sendCommunication` (19c).
- `src/app/(app)/jobs/communication-actions.ts` — `sendCommunicationAction` (19c).
- `src/components/delivery-transition-buttons.tsx` — Send rewire (19e).
- `src/server/analytics/exceptions.ts` — `listVendorNotAccepted` / `listNteIncreaseRequested` / `getExceptions` (19d).
- `src/app/(app)/notifications/page.tsx` + `src/components/exception-queue.tsx` + `src/app/(app)/layout.tsx` nav (19e).
- `db/migrations/0042_wealthy_sumo.sql` + schema edits (`communications.ts`, `clients.ts`) — migration unit (19b, `a2b7b0c`).
- `scripts/check-notifications-send.ts` + `package.json` alias `db:check:notifications-send` (19f).
- `docs/phase-19-notifications-send/` — `19-design-proposal.md` + this closeout set (19f).

> Commits: `a2b7b0c` migration 0042 · `8737944` send seam + exception detection + notifications surface
> · `b59a845` harness + closeout docs. (Placeholders filled at gate time.)

## DB changes

**ONE migration (0042), additive.** `communication_logs` += `provider_message_id` / `attempts` /
`last_error`; `client_locations` += `timezone` (data-model only). Table count 115 (unchanged); ledger 0042.
The first v2 migration. See `08-db-changes.md`.

## API routes / server actions added

`/notifications` (PULL). Server fns `sendCommunication`, `resolveSendContent`, `listVendorNotAccepted`,
`listNteIncreaseRequested`, `getExceptions`. Action `sendCommunicationAction`. The `SendProvider` seam
(`src/lib/integrations/send/`). See `09-api-routes.md`.

## User-facing workflows added

Exception triage at `/notifications`; real send via the job-detail Send button. See `03-user-sop.md`,
`05-system-workflows.md`.

## Admin/internal workflows added

The `RESEND_API_KEY` deploy step (capture-by-default until set); the send audit trail
(`communication.sent`/`failed`); the `db:check:notifications-send` harness. See `04-admin-sop.md`.

## Business rules added

R-19.1…R-19.7, each mapped to a harness group; plus the affirmed v2 invariants (§2.6 idempotency / §2.2
never-silent / §2.7 detection-not-auto-response / no-silent-send). See `06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — the Notifications surface, the send mechanism, capture-vs-real provider, the
wall-clock SLA note.

## Verification

```
pnpm run db:check:notifications-send
→ passed: 29 / failed: 0  — PHASE-19 NOTIFICATIONS-SEND LEDGER GREEN ✓   (run twice, identical; idempotent)
```
Groups: A send-path (CaptureProvider) · B idempotency · C capture-honesty (ResendProvider never built) ·
D exception readers + cross-tenant isolation · E write-boundary. `pnpm exec tsc --noEmit` → exit 0;
`pnpm run lint` → 0 errors; `pnpm run build` → clean, `/notifications` present.

## Known limitations

Wall-clock SLA timing (CF-19.1); no SMS (CF-19.2); no-same-day-on-site not detected (CF-19.3); real email
needs `RESEND_API_KEY`; `change_orders` `submitted_at` proxy; Resend Idempotency-Key vs failed-retry; the
roadmap §9 CF-12 numbering error (CF-19.4). See `10-known-limitations.md`.

## Carry-forward items

Discharged: the live email send backend (NOT a CF-12 retirement — see note), §2.6 idempotency, the
exception surface. New: CF-19.1, CF-19.2, CF-19.3, CF-19.4 + soft notes. The full Phase-18 bank — incl.
**CF-12.1–12.5 untouched** — rolls forward verbatim. See `closeout-carryforwards.md`.

## Recommended next phase focus

**Phase 20 — Vendor Edge Completion: photo/attachment physical storage + vendor-updates inbox hardening**
(roadmap v2.3.0). Closes the gaps the 17a sweep found in the otherwise-wired vendor portal; generates the
performance data later phases (AI dispatch) depend on.
