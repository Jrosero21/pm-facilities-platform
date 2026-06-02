# Phase 21 — Business Rules

Each rule maps to the harness group/assertion that proves it (`pnpm run db:check:magic-link`, **31/0**).
Group key: **G1** token happy + clock · **G2** the four negatives · **G3** linkless write provenance ·
**G4** shared-job read isolation · **G5** cross-tenant · **G6** send + idempotency · **G7** missing
recipient · **G8** no-leak symmetry.

| Id | Rule | Harness |
|---|---|---|
| **R-21.1** | **Single-assignment binding.** A valid token resolves `{ok:true}` bound to **exactly** the one assignment it was minted for. | G1 (1a), G2-bind (2-foreign-a) |
| **R-21.2** | **The four rejections → one uniform failure.** Expired, revoked, tampered (random 64-hex), and forged (one char flipped) all resolve to a single quiet `{ok:false}` — no reason branch, no throw. | G1 (1b), G2 (expired / revoked / tampered×2) |
| **R-21.3** | **Linkless write provenance.** A linkless note/photo lands `visibility='internal_only'`, with a **NULL** author (`created_by`/`uploaded_by`) and `source_token_id = tokenId`. | G3 (3a, 3b) |
| **R-21.4** | **Cross-vendor isolation on a shared job** *(the core requirement)*. With two tokens acting on one job, each token's readers return **only the rows that came through that token** (`source_token_id` gating), and a token cannot presign the **other** token's attachment. | G4 (4a–4d) |
| **R-21.5** | **Cross-tenant isolation.** A tenant-B token resolves to tenant B; a tenant-A read of that token returns empty, and a cross-tenant revoke affects 0 rows (`{revoked:false}`); the same-tenant revoke succeeds. | G5 (5a–5e) |
| **R-21.6** | **Idempotency (v2 §2 invariant 6).** `sent_at` is set only on a successful send and guarded on `IS NULL` (a second mark = 0 rows); a `communication_logs` row already sent short-circuits on its `provider_message_id` (a double `sendCommunication` = **one** capture). | G6 (6a–6e) |
| **R-21.7** | **No orphan token.** An assignment with no deliverable recipient email throws `MISSING_RECIPIENT` **before** any mint — **zero** tokens are created. | G7 (7a, 7b) |
| **R-21.8** | **Write-confine (defense-in-depth).** Even with a valid token, a writer call whose `vendorScope` does not cover the target assignment's vendor is rejected with `VENDOR_SCOPE_MISMATCH`. | G2-write (2-foreign-c) |
| **R-21.9** | **No-existence-leak symmetry.** A request for a **non-existent** attachment id returns the **identical** `forbidden` as a request for an **out-of-scope / wrong-token** one — a probe cannot distinguish "doesn't exist" from "not yours". | G8 (8a), G2-read (2-foreign-b), G4 (4d) |

## Invariant scope note

**Phase 21 is NOT a full autonomy phase** — it is a token-secured access channel onto the existing
vendor update surface. The v2 §2 autonomy invariants are therefore **not** affirmed wholesale here.

The invariants this phase **does** bind, each proven above:
- **Token security — single-assignment binding + uniform rejection.** A token reaches exactly its one
  assignment; bad/expired/revoked/forged tokens are one indistinguishable failure. → R-21.1, R-21.2.
- **Tenant + cross-vendor isolation.** No cross-tenant reach; on a shared job each token is confined to
  its own provenance; defense-in-depth write-confine. → R-21.4, R-21.5, R-21.8.
- **v2 §2 invariant 6 — idempotency.** Link delivery (`sent_at`) and send dispatch
  (`provider_message_id`) are idempotent; revoke is idempotent. → R-21.6.
- **No-existence-leak (Phase-20 posture, inherited).** Missing ≡ forbidden, symmetric across the readers.
  → R-21.9.
- **Capture-then-review (v1 §2.3, inherited).** Linkless notes/photos land `internal_only`, never
  auto-client-visible. → R-21.3.

The remaining §2 invariants (opt-in gating of autonomous *decisions*, never-silent autonomous action,
guardrail caps, etc.) belong to the autonomy phases (Phase 22+) and are **not** in scope here.
