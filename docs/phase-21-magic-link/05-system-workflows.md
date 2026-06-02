# Phase 21 — System Workflows

## Workflow 21.A — Operator sends a link (mint → compose → send)

```
dispatch page: VendorLinkSection → "Send link"
sendLinkAction(jobId, assignmentId)  [operator session; requireTenant]
        │
sendAssignmentLink({ tenantId, assignmentId, actorUserId })
        │   getAssignmentDetail → ASSIGNMENT_NOT_FOUND if missing
        │   ── RECIPIENT FIRST (before any mint) ──────────────────────────
        │   if !assignment.vendorContactId             → throw MISSING_RECIPIENT
        │   contact = getVendorContact(...)
        │   if !contact?.email                          → throw MISSING_RECIPIENT
        │   ── mint (only now) ─────────────────────────────────────────────
        │   { tokenId, rawToken } = mintToken({ ..., expiresInSeconds: 604800 })
        │        // persists sha256(rawToken); rawToken returned ONCE
        │   link = `${APP_URL}/link/${rawToken}`        // raw token → body only
        │   INSERT outbound_messages { subject, body=link, createdByUserId }
        │   INSERT communication_logs { channel=email, direction=outbound,
        │            sourceType=outbound_message, sourceId=om, recipientType=vendor_contact,
        │            recipientEmail, deliveryStatus=draft }
        │   result = sendCommunication({ commId })       // capture-by-default seam
        │   if result.deliveryStatus === "sent":
        │       UPDATE magic_link_tokens SET sent_at=now()
        │            WHERE id=tokenId AND sent_at IS NULL   // idempotent guard
        │
returns { tokenId, deliveryStatus }   // NEVER rawToken
```
Recipient-before-mint = no orphan token. `sent_at` is set only on a successful send, guarded on
`IS NULL` (a re-send is a fresh token; a re-mark is a no-op).

## Workflow 21.B — Vendor opens a link (resolve → render)

```
GET /link/<rawToken>            (session-public segment, OUTSIDE the auth shell)
page.tsx:
        resolveMagicLinkToken(rawToken)
            !ok (missing/expired/revoked/forged)  → <InvalidLink/>  (one uniform message)
            ok → getAssignmentDetail(tenantId, assignmentId)
                 missing → <InvalidLink/>
                 → render the assignment surface (status-driven action set) + notes + photos
                   (notes/photos read via the source_token_id-gated token-side readers)
```

## Workflow 21.C — A linkless action (re-resolve → derive → writer) — THE SPINE

```
<form> → e.g. markOnSiteLinkAction(rawToken, _prev, formData)   ["use server"]
        │
resolveLinkContext(rawToken):
        │   res = resolveMagicLinkToken(rawToken);  if !res.ok → return null
        │   asg = getAssignmentDetail(res.tenantId, res.assignmentId);  if !asg → null
        │   return { tenantId, assignmentId,
        │            vendorScope: Set([asg.vendorId]),          // FROM the token, not the client
        │            actor: { kind:"linkless", tokenId: res.tokenId } }
        │   null → return INVALID_LINK   (uniform "no longer valid")
        │
writer({ assignmentId, tenantId, vendorScope, actor })
        │   getAssignmentDetail → ASSIGNMENT_NOT_FOUND ; canActOnAssignment(vendorScope) → VENDOR_SCOPE_MISMATCH
        │   transition / note / photo  →  changedBy/created_by/uploaded_by = NULL,
        │                                  source_token_id = actor.tokenId, audit actorLabel="linkless-vendor"
        │   (note/photo land visibility='internal_only' — capture-then-review)
        │
revalidatePath(`/link/${rawToken}`)
```
**Nothing downstream comes from the client.** tenantId / assignmentId / vendorScope / actor all derive
from the re-resolved token, every action, every time.

## Workflow 21.D — Revoke

```
dispatch page: token list → "Revoke"
revokeLinkAction(jobId, assignmentId, tokenId)  [operator; requireTenant]
        │
revokeToken({ tokenId, tenantId })
        │   UPDATE magic_link_tokens SET revoked_at=now()
        │       WHERE id=tokenId AND tenant_id=tenantId AND revoked_at IS NULL
        │   return { revoked: affectedRows === 1 }     // tenant-scoped + idempotent
```
A revoke from the wrong tenant, or a second revoke of the same token, affects 0 rows → `{revoked:false}`.
The vendor's **next action** then re-resolves and fails uniformly (the spine catches it at action time,
not just render).

## Workflow 21.E — Capture-by-default (no real send, no real R2)

```
SEND_CAPTURE=1 (or no RESEND_API_KEY)  → CaptureProvider        (Phase-19 send seam; no email)
STORAGE_CAPTURE=1 (or no R2_ACCESS_KEY_ID) → CaptureStorageProvider (Phase-20 storage seam; no R2)
```
The harness forces both; production wires real email (RESEND_*) + real R2 (R2_*) only when those vars
are deployed. `APP_URL` must also be set so links are reachable.
