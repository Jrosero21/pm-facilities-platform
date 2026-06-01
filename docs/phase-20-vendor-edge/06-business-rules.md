# Phase 20 — Business Rules

Each rule maps to the harness group/assertion that proves it (`pnpm run db:check:vendor-edge`).

| Id | Rule | Harness |
|---|---|---|
| **R-20.1** | A real upload persists `storage_key`/`checksum`/`storage_provider`/`file_size_bytes`/`file_mime_type` and stores the bytes under the row's `storage_key`. | 1a, 1d |
| **R-20.2** | **Capture-then-review (v1 §2.3):** vendor photo uploads land `visibility='internal_only'` — never auto-client-visible. | 1b |
| **R-20.3** | **Put-before-insert:** a successful upload row exists only if the bytes were stored; a failed put writes **no row**. | 5b, 5c |
| **R-20.4** | **Integrity:** the checksum stored on the row equals `sha256(bytes)` — no corruption through the path. | 5a |
| **R-20.5** | **Placeholder preserved:** with no file, `storage_key` is NULL and `job_attachment.placeholder_created` is audited; the prior behavior is unchanged. | 2a, 2b |
| **R-20.6** | **Cross-tenant isolation:** a vendor scoped to another tenant cannot serve this tenant's attachment → `forbidden`. | 3a |
| **R-20.7** | **Author-scope:** a vendor sees/serves only attachments uploaded by a user in their own `vendor_users` scope (even on the same job). | 4a |
| **R-20.8** | **No existence leak:** a missing attachment id and an out-of-scope attachment return the **identical** `forbidden` result. | 4b, 4c |

## Invariant scope note

**Phase 20 is not an autonomy-touching phase** — it is infrastructure (object storage) under the
existing vendor capture surface. The v2 §2 **autonomy** invariants (opt-in gating, never-silent,
guardrails, idempotency-of-autonomous-writes, etc.) are therefore **not in scope** here and are not
affirmed by this phase.

The invariants this phase **does** bind, each proven above:
- **v1 §2.3 — capture-then-review.** Vendor photos are captured `internal_only`; operator-gated
  promotion (not auto-client-visible). → R-20.2.
- **Tenant isolation.** No cross-tenant read of attachments. → R-20.6.
- **Author-scope + no existence leak.** A vendor reads only their own scope's attachments; probing
  foreign/missing ids yields one indistinguishable `forbidden`. → R-20.7, R-20.8.
- **Write integrity / put-before-insert.** No orphan rows; checksum integrity. → R-20.3, R-20.4.
