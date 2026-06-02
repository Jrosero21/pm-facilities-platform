# Phase 21 — Phase Summary

**Phase:** 21 — Linkless Magic-Link Vendor Access + Outbound Delivery (v2.4.0-phase-21).
**Branch:** `phase-21-magic-link` (off `main@7c3b217`, the Phase-20 CF-20.3 roadmap-fix close).
**Outcome:** an **unregistered vendor** can update **exactly one** work-order assignment through a
**signed, single-assignment-scoped link — with no account**. The link carries an opaque token; the
server hashes-and-looks-it-up (token scheme B), and **every action re-resolves the token server-side**
and derives tenant / assignment / vendor-scope / actor **from the token, never from a client field**.
A bad / expired / revoked / forged token yields **one uniform failure** (no existence leak). On the
**third v2 migration** (0044, additive). A **31-assertion** phase-blocking security harness is green.

## What Phase 21 is

The Phase-17a sweep confirmed the vendor update surface (status transitions, notes, photos) was wired —
but it required a **registered vendor account**. Phase 21 opens that surface to an **unregistered**
vendor through a magic link, **without** loosening any of the vendor capture-then-review or isolation
guarantees. It is the **highest-risk security surface in v2** (a public, session-unauthenticated route),
so it earned its own phase with the heaviest harness in v2.

- **Token core** (`src/server/magic-links/token-core.ts`): `mintToken` returns the raw token **once**
  and persists only `sha256(rawToken)`; `resolveMagicLinkToken` returns one quiet `{ok:false}` for
  missing / expired / revoked / forged (no reason branch, no throw); `revokeToken` is `affectedRows`-on-
  `IS NULL` idempotent. Revocable, expiring, single-assignment-scoped — the row is also the idempotency
  home for link delivery (`sent_at`).
- **Discriminated `VendorActor`** (`src/server/vendor/types.ts`): the four vendor writers were widened
  from `actorUserId: string` to `VendorActor = {kind:"user";userId} | {kind:"linkless";tokenId}`.
  **Registered-user behavior is byte-for-byte unchanged**; a linkless write lands **NULL author** +
  `source_token_id = tokenId`.
- **Public token route** (`src/app/link/[token]/`): a **session-unauthenticated** segment **outside**
  the `(app)/(client)/(vendor)` auth shells. Its 8 linkless server actions (accept / decline / confirm
  ETA / confirm schedule / on-site / complete / note / photo) each re-resolve the raw token (the
  security spine). **Invoice is excluded** from the link surface.
- **Operator delivery + revoke** (`src/server/magic-links/{send-link,list-assignment-tokens}.ts`):
  the dispatch page gains **Send link** (recipient-checked **before** mint → mint → compose
  `outbound_messages` + `communication_logs` → `sendCommunication` → `sent_at` guard) and **Revoke**
  controls. The raw token is **never** returned to the operator UI or logged.
- **Reads gated by provenance** (`src/server/magic-links/link-surface.ts`): the token-side readers
  gate on `source_token_id === resolvedTokenId` — **not** author-scope — so a vendor sees **only what
  came through their own link**, even on a job shared with another vendor.

## Schema posture — ONE migration (0044), additive

`magic_link_tokens` (new table: `token_hash` UNIQUE, `expires_at` / `revoked_at` / `sent_at`, 3 FKs) +
`source_token_id` (nullable varchar 36, → `magic_link_tokens`, set null) on **both** `job_notes` and
`job_attachments`. `source_token_id NULL` = a registered (non-link) write. Table count **116**; ledger
**45** (sandbox + prod). See `08-db-changes.md`.

## Built on

- **Phase 20** — the storage backend the linkless photo upload writes through (capture-then-review,
  `internal_only`, presigned read).
- **Phase 19** — the channel-agnostic `SendProvider` send seam the link is delivered through (only
  email wired today; SMS banked).

## The build (6 commits)

`93bf036` migration 0044 (table + provenance) · `f2e7868` token core (mint / resolve / revoke) ·
`2f5b72c` discriminated `VendorActor` across the vendor writers · `dcb8dbb` token-authed public link
route + the 8 linkless actions · `2ee4f78` operator link delivery (mint / send) + revoke control ·
`2f6d304` the 31-assertion security harness. (The closeout-docs commit is the 7th unit, landing at the
close gate.)

## Verification

`pnpm run db:check:magic-link` — **31/0 GREEN from committed state** (8 groups: token happy-path +
expiry clock · the four negatives → uniform `{ok:false}` · linkless write provenance · shared-job read
isolation · cross-tenant isolation · send + idempotency · missing-recipient → no orphan token ·
no-existence-leak symmetry). Forced through **both** capture backends (`SEND_CAPTURE=1` +
`STORAGE_CAPTURE=1`) — no real email, no real R2. `pnpm exec tsc --noEmit` → 0.

## Disposition note

Phase 21 is a **pure build phase — it retires NOTHING** from the inherited carry-forward bank. In
particular **B-16.3 stays OPEN**: it is (a) the operator chat UI **and** (b) a vendor-direction publish
path for `update_rewrite_drafts`; Phase 21 built **neither** — it built magic-link **link** delivery (a
new vendor-direction `communication_logs` send path) which only **partially unblocks** the outbound
infrastructure. The roadmap §6/§9 "retires B-16.3 (Phase 21)" claim is wrong and is recorded as a
doc-correction carry-forward (**CF-21.1**, analogous to CF-19.4 / CF-20.3). See `11-closeout.md` /
`closeout-carryforwards.md`.
