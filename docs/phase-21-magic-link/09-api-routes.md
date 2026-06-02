# Phase 21 — API Routes / Server Actions

One **new public HTTP route** (`/link/[token]`), session-unauthenticated and token-authed, sitting
**outside** the `(app)`/`(client)`/`(vendor)` auth shells. Everything else is server functions + actions.

## The public token route (`src/app/link/[token]/`)

| File | Role |
|---|---|
| `page.tsx` | session-public Server Component: resolves the raw token → early-return `<InvalidLink/>` on failure → renders the assignment surface (status-driven actions) + token-scoped notes/photos |
| `actions.ts` | the **8 linkless server actions** + the shared `resolveLinkContext` (the security spine) + `mapWriterError` (generic, no token-reason leak) |
| `src/components/magic-link/link-surface.tsx` | the client forms (status → available action set; note; photo) |

**The route has NO session auth.** The **token is the only credential**, and it is **re-resolved on
every action** (not trusted from render). `resolveLinkContext(rawToken)` derives
`tenantId`/`assignmentId`/`vendorScope`/`actor` **from the token** — never from a client field.

### The 8 linkless server actions (`"use server"`)

`acceptLinkAction` · `declineLinkAction` (reason) · `confirmEtaLinkAction` (etaStartAt) ·
`confirmScheduleLinkAction` · `markOnSiteLinkAction` · `markWorkCompleteLinkAction` ·
`addNoteLinkAction` (body) · `uploadPhotoLinkAction` (title + optional file, MIME allowlist + 15 MB).

Each: `resolveLinkContext(rawToken)` → `null` ⇒ return the uniform `INVALID_LINK`; else call the
matching vendor writer with the token-derived context; map writer errors to a generic message;
`revalidatePath('/link/<token>')`. **Invoice is deliberately NOT exposed** (D-21.8).

## Token core (`src/server/magic-links/token-core.ts`)

| Function | Behavior | Returns / Throws |
|---|---|---|
| `mintToken({tenantId, assignmentId, expiresInSeconds, createdByUserId?})` | `rawToken = randomBytes(32).hex`; persists only `sha256(rawToken)` | `{ tokenId, rawToken }` (rawToken returned **once**) |
| `resolveMagicLinkToken(rawToken)` | hash-and-lookup; one quiet failure for `!row \|\| revoked \|\| expired` | `{ok:true, tokenId, tenantId, assignmentId}` \| `{ok:false}` |
| `revokeToken({tokenId, tenantId})` | `UPDATE … SET revoked_at=now() WHERE id AND tenant_id AND revoked_at IS NULL` | `{ revoked: affectedRows === 1 }` (tenant-scoped, idempotent) |

`resolveMagicLinkToken` does **not** branch its failure by reason and does **not** throw on a bad token
(no existence leak). `mintToken` does **not** validate `expiresInSeconds` (so the harness mints `-1` for
an already-expired token).

## Operator delivery + token list (`src/server/magic-links/`)

| Function | File | Behavior | Throws |
|---|---|---|---|
| `sendAssignmentLink({tenantId, assignmentId, actorUserId})` | `send-link.ts` | recipient-check **before** mint → `mintToken(604800)` → compose `outbound_messages`+`communication_logs` → `sendCommunication` → `sent_at` guard | `ASSIGNMENT_NOT_FOUND`, `MISSING_RECIPIENT` |
| `listAssignmentTokens(tenantId, assignmentId)` | `list-assignment-tokens.ts` | selects id/createdAt/expiresAt/revokedAt/sentAt (**never** `token_hash`); derives state `revoked`/`expired`/`unsent`/`active` | — |

`sendAssignmentLink` returns `{ tokenId, deliveryStatus }` — **never** the rawToken. The new env var
**`APP_URL`** (the absolute link base) is read here; see `04-admin-sop.md`.

## Token-side readers — gated on `source_token_id` (`link-surface.ts`)

| Function | Behavior |
|---|---|
| `listLinkNotes(tenantId, tokenId)` | notes WHERE tenant + `source_token_id = tokenId` + non-archived |
| `listLinkAttachments(tenantId, tokenId)` | attachments, same gate |
| `getLinklessAttachmentUrl(tenantId, attachmentId, tokenId)` | `source_token_id`-gated → presign (Phase-20 5-min); 4-kind `url`/`placeholder`/`unavailable`/`forbidden` (missing ≡ wrong-token ≡ `forbidden` — no leak) |

These gate on **provenance**, not author-scope — a linkless write has a NULL author (D-21.3).

## Vendor writers (extended to `VendorActor`)

`acceptDispatch`/`declineDispatch`/`confirmEta`/`confirmSchedule`/`markOnSite`/`markWorkComplete`
(`assignment-actions.ts`), `createVendorNote`, `createVendorPhotoPlaceholder`, `submitVendorInvoice` now
take `actor: VendorActor = {kind:"user";userId} | {kind:"linkless";tokenId}`
(`src/server/vendor/types.ts`). Registered-user behavior is unchanged; the linkless branch sets NULL
author + `source_token_id` + audit `actorLabel="linkless-vendor"`. `createJobNote` was **minimally**
widened (`createdByUserId: string|null` + optional `sourceTokenId`/`auditActorLabel`) — shared with
operator/client callers, so not given `VendorActor` (D-21.5).

## Operator dispatch-page wiring

`src/app/(app)/jobs/[id]/dispatch/[assignmentId]/{page.tsx,actions.ts}` — the page resolves
`recipientEmail` + `listAssignmentTokens` and renders `<VendorLinkSection>`; `actions.ts` adds
`sendLinkAction` + `revokeLinkAction` (+ a `LinkControlState` type). `src/components/vendor-link-section.tsx`
renders the Send button (disabled with a note when there's no recipient email) + the token list with
Revoke buttons.

## Env

`APP_URL` (NEW — absolute link base; localhost fallback dev-only). Plus the existing `RESEND_*`
(Phase-19 send) and `R2_*` (Phase-20 storage); `SEND_CAPTURE` / `STORAGE_CAPTURE` for the harness.

## Harness alias (package.json)

| Script | Command |
|---|---|
| `db:check:magic-link` | `tsx --env-file=.env.local --conditions=react-server scripts/check-phase-21.ts` |
