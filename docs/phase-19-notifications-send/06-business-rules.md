# Phase 19 — Business Rules

Each rule maps to the harness group/assertion that proves it (`pnpm run db:check:notifications-send`).

| Id | Rule | Harness |
|---|---|---|
| **R-19.1** | A send composes the **resolved source content** (not the `summary` excerpt), transmits via the provider, flips `delivery_status='sent'`, stores `provider_message_id`, bumps `attempts`, sets `sent_at`, and writes one `communication.sent` audit row. | A1–A7 |
| **R-19.2** | A send with no `recipient_email` → `MISSING_RECIPIENT`; an unsupported `source_type` → `UNRESOLVABLE_SEND_SOURCE`. Neither transmits. | A8, A9 |
| **R-19.3** | **Idempotency (§2.6):** a 2nd send of an already-sent row returns early — no 2nd provider call, no 2nd capture, no `attempts` bump, no 2nd audit. A `failed` row (no `provider_message_id`) may retry. | B1–B4 |
| **R-19.4** | **Capture-honesty:** with `SEND_CAPTURE=1` (no key), `getSendProvider().name==='capture'` and `ResendProvider` is never constructed — no real email is possible in the harness path. | C1–C3 |
| **R-19.5** | `getExceptions` surfaces `vendor_not_accepted` (status `SENT`), `nte_increase_requested` (`submitted`), and `operational` (overdue), labeled `#job · client`, excludes pure-`aged`, sorted by `sortKey` DESC. | D1–D5 |
| **R-19.6** | **Cross-tenant isolation:** another tenant's exceptions never surface. | D6 |
| **R-19.7** | **Write-boundary:** a send is an UPDATE — it moves only `communication_logs` (1) + `audit_logs` (+1); no new content/job rows; the exception readers are pure reads. | E1–E4 |

## v2 invariants touched (affirmed)

- **§2.6 — Idempotency on every autonomous-capable write.** The send write carries a two-layer
  "did I already do this?" guard (`provider_message_id`-present short-circuit + the legal-transition
  guard + the provider `Idempotency-Key`). → **R-19.3**, harness group B (double-fire captures exactly once).
- **§2.2 — Never silent.** Every send (success or failure) writes an `audit_logs` row
  (`communication.sent` / `communication.failed`). → **R-19.1**, harness A7.
- **§2.7 — Manage by exception (detection, not auto-response).** `getExceptions` **detects and surfaces**;
  it does not act. Auto-response is Phase 28; autonomous sending is Phase 23. → **R-19.5**, the PULL surface.
- **No-silent-send (Fork-1 lineage).** A send happens **only** via the operator-triggered
  `sendCommunication`; nothing sends autonomously, and capture-by-default means no real email without a
  deployed key. → **R-19.4**, harness group C.
