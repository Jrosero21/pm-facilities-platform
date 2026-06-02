# Phase 21 — Decisions

## D-21.1 — Token scheme B (stored opaque token, hash persisted) over stateless JWT

The link carries a random opaque token (`randomBytes(32).toString("hex")`); the DB stores only
`sha256(rawToken)` in `magic_link_tokens.token_hash` (UNIQUE), **never the raw value**. Chosen over a
stateless signed JWT for three reasons that are hard requirements here:
- **Revocability.** A JWT is valid until expiry; revoking it needs a denylist — i.e. server state
  anyway. A DB row is revoked in one `UPDATE` (`revoked_at`).
- **Idempotency home.** Link delivery needs a place to record "already sent" (`sent_at`) and "already
  revoked" — the token row is that home (invariant 6).
- **Harness honesty.** Every negative becomes a deterministic DB-state assertion (mint-then-revoke,
  mint-with-past-expiry) rather than a clock/crypto fiction. Tamper-evidence is equivalent (a forged
  token matches no stored hash), with a **stronger leak posture** (a forged token is indistinguishable
  from a non-existent one).

## D-21.2 — Per-action token RE-RESOLUTION is the security spine

Every linkless server action calls `resolveLinkContext(rawToken)` which re-resolves the raw token and
derives `tenantId` / `assignmentId` / `vendorScope` / `actor` **from the token** — **never** from any
client-submitted field. There is no client-supplied tenantId or assignmentId anywhere in the link
surface. A revoked/expired/forged token between page-render and action-submit fails the **action**, not
just the render. This is the single rule the whole phase is built to protect.

## D-21.3 — `source_token_id` provenance for read isolation (not author-scope)

The Phase-20 vendor readers gate on **author-scope** (`uploaded_by_user_id ∈ vendor_users`). A linkless
write has **NULL author** — so author-scope can't identify it, and it would be invisible to its own
writer **and** lose cross-vendor isolation on a shared job. Resolved by stamping
`source_token_id = tokenId` on the `job_notes` / `job_attachments` row and gating the **token-side**
readers (`listLinkNotes` / `listLinkAttachments` / `getLinklessAttachmentUrl`) on
`source_token_id === resolvedTokenId`. A token sees **only the rows that came through it** — the core
shared-job requirement (proven by harness G4).

## D-21.4 — One discriminated `VendorActor`, not a parallel token write-path

Rather than fork a second set of token-only writers, the existing four vendor writers were widened to
take `VendorActor = {kind:"user";userId} | {kind:"linkless";tokenId}`. **Registered-user behavior is
byte-for-byte unchanged** (`changedByUserId = actor.kind==="user" ? actor.userId : null`); the linkless
branch sets NULL author + `source_token_id` + an audit `actorLabel` of `linkless-vendor`. One code path,
one set of invariants, one place to audit — no drift between a "registered" and a "linkless" writer.

## D-21.5 — `createJobNote` minimally widened, not given `VendorActor`

`createJobNote` is shared with operator **and** client callers, so it was **not** given the vendor-only
`VendorActor` type. It was minimally widened (`createdByUserId: string | null` + optional
`sourceTokenId?` / `auditActorLabel?`); operator/client call-sites are untouched. The `VendorActor`→
columns mapping happens one level up, in `createVendorNote`.

## D-21.6 — Mint-new-per-send

`sendAssignmentLink` mints a **fresh** token on every send (it does not reuse or re-send an existing
one). Simpler and safer: a re-send is always a clean, independently-revocable token; there is no
"resurrect an expired/revoked token" path. The cost is token-row accumulation per assignment (by
design; the revoke UI surfaces each token's state) — banked soft as CF-21.3.

## D-21.7 — Recipient checked BEFORE mint (no orphan token)

`sendAssignmentLink` resolves the recipient email **first** (`assignment.vendorContactId` →
`getVendorContact().email`); a missing contact or missing email throws `MISSING_RECIPIENT` **before**
`mintToken` is called. No token is ever minted for an assignment that has no deliverable recipient
(proven by harness G7). The raw token goes straight into the email body and is **never** returned to the
operator UI or logged.

## D-21.8 — Invoice excluded from the link surface

The link surface exposes **8** actions (accept / decline / confirm ETA / confirm schedule / on-site /
complete / note / photo). **Invoice submission is deliberately excluded** — invoicing is a
financial/registered-vendor concern, not something an unauthenticated link-holder should do. The vendor
invoice writer was widened to `VendorActor` for uniformity (so all four writers share one actor shape),
but **no linkless action calls it**.

## D-21.9 — 7-day default expiry (MVP, not yet configurable)

Tokens expire **604800 s (7 days)** by default (`sendAssignmentLink`). A per-tenant / per-assignment
expiry knob is deferred (banked as a known limitation) — the MVP window is a fixed constant.

## D-21.10 — Public route OUTSIDE the auth shell

`src/app/link/[token]/` is a **top-level** session-public segment, deliberately **outside** the
`(app)` / `(client)` / `(vendor)` route groups and their `requireTenant` / `requireVendor` layouts. It
has **no session auth** — the **token is the only credential**, re-validated per action. This keeps the
auth-shell layouts unchanged and makes the "no session here" boundary explicit.

## D-21.11 — `getLinklessAttachmentUrl` gates on provenance, presigns via the Phase-20 seam

The linkless attachment serve reuses the Phase-20 presigned-URL mechanism (5-minute issuance-scoped
URL) but swaps the **gate**: it confirms the attachment's `source_token_id === resolvedTokenId` (+ tenant
+ non-archived) rather than author-scope. Missing **or** not-this-token's → one uniform `forbidden` (no
existence leak — proven by G8, symmetric with the wrong-token case). It inherits the Phase-20
issuance-window limitation (a URL already issued survives revocation until it expires).
