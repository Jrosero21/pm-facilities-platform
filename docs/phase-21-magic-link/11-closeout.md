# Phase 21 — Closeout

## Goal

Let an **unregistered vendor** update **exactly one** work-order assignment through a **signed,
single-assignment-scoped magic link — with no account** — without loosening any vendor isolation or
capture-then-review guarantee, and deliver/revoke that link from the operator dispatch page. The highest-
risk security surface in v2 (a public, session-unauthenticated route), proven by the heaviest harness in
v2. On the third v2 migration (0044, additive).

## Completed deliverables

- **Token core** (`src/server/magic-links/token-core.ts`): `mintToken` (returns rawToken once; persists
  only `sha256`), `resolveMagicLinkToken` (one quiet `{ok:false}` for missing/expired/revoked/forged),
  `revokeToken` (tenant-scoped, `affectedRows`-on-`IS NULL` idempotent). Token scheme **B** (stored
  opaque token, hash persisted) — revocable, expiring, single-assignment-scoped, the idempotency home.
- **Discriminated `VendorActor`** (`src/server/vendor/types.ts`): the four vendor writers widened from
  `actorUserId: string` to `{kind:"user";userId} | {kind:"linkless";tokenId}`; registered behavior
  byte-for-byte unchanged; linkless = NULL author + `source_token_id` + `actorLabel="linkless-vendor"`.
- **Public token route** (`src/app/link/[token]/`): a session-unauthenticated segment **outside** the
  auth shells; 8 linkless server actions, **each re-resolving the raw token** and deriving
  tenant/assignment/scope/actor from it (the security spine). Invoice excluded.
- **Provenance-gated readers** (`src/server/magic-links/link-surface.ts`): `listLinkNotes` /
  `listLinkAttachments` / `getLinklessAttachmentUrl`, gated on `source_token_id === resolvedTokenId` —
  a token sees only its own rows on a shared job.
- **Operator delivery + revoke** (`send-link.ts`, `list-assignment-tokens.ts`, `VendorLinkSection`,
  dispatch page/actions): recipient-checked-before-mint send (compose `outbound_messages` +
  `communication_logs` → `sendCommunication` → `sent_at` guard); token list + revoke; raw token never
  returned/logged.
- **Migration 0044:** `magic_link_tokens` + `source_token_id` on `job_notes`/`job_attachments`.
- A **31-assertion phase-blocking security harness**, green from committed state.

## Files created / changed (commits `93bf036` · `f2e7868` · `2f5b72c` · `dcb8dbb` · `2ee4f78` · `2f6d304`)

- `src/server/schema/magic-links.ts` (new table) + `job-details.ts` (`source_token_id` ×2) +
  `db/migrations/0044_premium_fabian_cortez.sql` — migration unit (`93bf036`).
- `src/server/magic-links/token-core.ts` — mint/resolve/revoke (`f2e7868`).
- `src/server/vendor/types.ts` + the 4 vendor writers + `createJobNote` minimal widen + 9 vendor
  call-sites + 2 prior harnesses — the discriminated-actor refactor (`2f5b72c`).
- `src/app/link/[token]/{page.tsx,actions.ts}` + `src/server/magic-links/link-surface.ts` +
  `src/components/magic-link/link-surface.tsx` — token-route surface (`dcb8dbb`).
- `src/server/magic-links/{send-link,list-assignment-tokens}.ts` +
  `src/components/vendor-link-section.tsx` + dispatch `[assignmentId]/{page,actions}` — operator
  delivery/revoke (`2ee4f78`).
- `scripts/check-phase-21.ts` + `package.json` alias `db:check:magic-link` — harness (`2f6d304`).
- `docs/phase-21-magic-link/` — this closeout set (the 7th unit, this commit).

## DB changes

**ONE migration (0044), additive.** New table `magic_link_tokens` (token_hash UNIQUE, 3 FKs, composite
index) + `source_token_id` (nullable, FK set null) on `job_notes` and `job_attachments`. Table count
**116**; ledger **45** (sandbox + prod). See `08-db-changes.md`.

## API routes / server actions added

One new public route `/link/[token]` (session-unauthenticated, token-authed, **outside** the auth
shell). Token core `mintToken`/`resolveMagicLinkToken`/`revokeToken`; the 8 re-resolving linkless
actions; `sendAssignmentLink`; `listAssignmentTokens`; the `source_token_id`-gated readers. The 4 vendor
writers extended to `VendorActor`. See `09-api-routes.md`.

## User-facing workflows added

Vendor: open a link (no account) → accept/decline/confirm-ETA/confirm-schedule/on-site/complete/note/
photo. Operator: Send link + Revoke from the dispatch page. See `03-user-sop.md`, `05-system-workflows.md`.

## Admin/internal workflows added

`APP_URL` go-live (the absolute link base — wrong/unset = dead links); token behavior (7-day expiry,
revocable, hashed, uniform failure); the `db:check:magic-link` harness (both capture backends). See
`04-admin-sop.md`.

## Business rules added

R-21.1…R-21.9, each mapped to a harness group. **Phase 21 is not a full autonomy phase** — only the
token-security + tenant/cross-vendor isolation + **§2 invariant 6 (idempotency)** + no-existence-leak +
capture-then-review rules are affirmed (not the wholesale §2 autonomy invariants). See `06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — operators send unregistered vendors a secure single-assignment link; vendors
act with no account; links expire/revocable with uniform failure; updates land internal_only; a vendor
sees only what came through their own link; no invoice via link.

## Verification

```
pnpm run db:check:magic-link
→ passed: 31 / failed: 0  — PHASE-21 MAGIC-LINK LEDGER GREEN ✓   (green from committed state 2f6d304; teardown clean)
```
Groups: token happy-path + expiry clock · the four negatives (expired/revoked/tampered/foreign-
assignment) → uniform `{ok:false}` · linkless write provenance · shared-job read isolation · cross-tenant
isolation · send + idempotency (sent_at isNull guard + provider_message_id short-circuit) ·
missing-recipient → no orphan token · no-existence-leak symmetry. Forced through **both** capture
backends (`SEND_CAPTURE=1` + `STORAGE_CAPTURE=1`) — no real email, no real R2. `pnpm exec tsc --noEmit`
→ 0.

## Known limitations

Presigned image URL outlives revocation (~5-min issuance window, inherited from Phase 20); `APP_URL`
misconfig = dead links; 7-day expiry not yet per-tenant configurable; token visible in URL (history/proxy
logs) — protected by expiry+revocation+single-assignment-scope, not URL secrecy; mint-new-per-send
accumulates token rows (by design; CF-21.3); SMS delivery not wired (email only; CF-21.4). See
`10-known-limitations.md`.

## Carry-forward items

**Retired this phase: NOTHING.** Phase 21 is a pure build phase — no inherited carry-forward item is
discharged. In particular **B-16.3 stays OPEN** (it is the operator chat UI + the `update_rewrite_drafts`
vendor-direction publish path; Phase 21 built neither — magic-link link delivery only **partially
unblocks** the vendor-direction outbound channel). New items: **CF-21.1** (roadmap §6/§9 "retires
B-16.3" doc-correction — analogous to CF-19.4/CF-20.3; the third recurrence of the pattern), **CF-21.2**
(vendor account-claim/onboarding from linkless usage — the linkless→registered bridge; relates FB-10a.1),
**CF-21.3** (soft — mint-new-per-send token accumulation), **CF-21.4** (soft — SMS link delivery; relates
CF-19.2). The **CF-21.1 roadmap edit is a separate gated step AFTER close**, not part of this phase. See
`closeout-carryforwards.md`.

## Recommended next phase focus

**Phase 22 — Dispatch Engine (Tiers 1–2)** (roadmap v2.5.0): the operator-assist matching/ranking
engine over the dispatch facets, the next step toward aggregator autonomy. (The magic link Phase 21
built is the channel an eventual autonomous dispatch acts through — but the matching engine itself is
Phase 22+, not built here.)
