# Phase 11 — Decisions

The eight forks were locked in `11b-decisions-locked.md` (committed `5f21666`) on the empirical basis of the `11a` inspection. This doc records them as DoR-style decisions with the as-built outcome and any construction-time refinement.

## D-11.1 — `client_users` is the lean `vendor_users` twin
`(id, tenant_id, user_id, client_id, created_at, updated_at)`; unique `(tenant_id, user_id, client_id)`; index `(tenant_id, client_id)`; all three FKs `ON DELETE CASCADE`. No `status` column (11c confirmed `vendor_users` carries none — the lean shape is the actual one, overriding 11b's prose). Migration `0027`.
**Why:** client scoping differs from vendor scoping in nothing at the mapping layer; reuse the proven substrate.

## D-11.2 — predicate / resolver / guard split
`isClientUser(ctx)` (pure predicate) + `getClientScope(userId, tenantId) → Set<clientId>` (impure resolver) + `requireClient() → ClientAuthContext` (guard, redirects to `/client-no-access` on non-client or empty scope). Mirrors `isVendorUser`/`getVendorScope`/`requireVendor`.
**Why:** the split is proven and keeps the predicate unit-testable.

## D-11.3 — `(client)` route group
`src/app/(client)/` with its own `requireClient` layout + nav chrome (scope-count chip). The `(app)` layout gained a client-redirect branch (after the vendor branch) routing a scoped client_user with no operator role to `/client/jobs`.
**Why:** mirrors `(vendor)`; URL-invisible group, isolated guard.

## D-11.4 — client submission wraps `createJob`, server-pins identity
`createClientJob` pins `client_id` from `clientScope` (re-validated even at scope size 1), `source_type='internal_client_portal'`, `created_by_user_id` from ctx; passes `primaryTradeId=null`, NTE omitted (Case E → null). Initial status NEW is hardcoded inside `createJob` (direct-to-queue, no pending-intake status). New error `CLIENT_SCOPE_MISMATCH`. `createJob` unchanged.
**Why:** reuse the Phase-4 writer (counter + status-history + event + audit, all in one txn); the wrapper is the pin-and-validate unit. Invariants I1–I5 (see `06-business-rules`).

## D-11.5 — F5a: omit the priority picker (MVP)
The client form sends only `clientId` (multi-client only), `clientLocationId`, `problemDescription`. `priorityId` stays in the wrapper type (forward-compat) but the form never sends it → wrapper passes null. Operator triages priority.
**Why:** clients rarely classify priority well; one fewer reader; operator owns triage.

## D-11.6 — note visibility filter + client write defaults (Fork 5)
Client sees `visibility ∈ {client_visible, client_and_vendor_visible}` OR `(origin='client' AND author ∈ client_users-scope)`. Client writes land `origin='client'`, `visibility='client_visible'`.
**Why:** the client-facing half of the visibility enum; symmetric with the vendor filter (DoR-10l.2).

## D-11.7 — Option (b) plain note render
The client detail renders notes as plain "team updates" (author or "Team" + timestamp + body) — **no** `NoteVisibilityBadge` / `NoteOriginBadge`. Operator classifications ("internal_only", "Vendor") don't leak to the client.
**Why:** the badges expose internal team structure and operator jargon; a client just needs the update.

## D-11.8 — accept-only proposals (Fork 6)
Client sees `status='sent'` proposals on their jobs and can ACCEPT (→ `recordProposalAcceptance`, decision='accepted'). NO client-side reject. The proposal section lives on the job detail page (no `/client/proposals` route — not in the roadmap deliverables).
**Why:** accept-only is the MVP; reject/revise stays an operator decision, preserving the Phase-8 revision chain.

## D-11.9 — OQ-6 total-only on billing surfaces (Fork 7)
Client invoice + proposal readers expose `total` only — never `subtotal`/`markup_total`/line items. Invoices are `status='sent'` only, scope-filtered, list-only (no `/client/invoices/[id]`).
**Why:** OQ-6 (margin confidentiality) is a documented Phase-8 AR contract; list-only keeps the surface OQ-6-safe.

## D-11.10 — R1: widen `createJobNote` origin union (shared-infra edit)
`CreateJobNoteInput.origin` widened `"operator" | "vendor"` → `+ "client"` (one word; default and logic unchanged). This edits Phase-4/6 shared infra (`src/server/job-notes.ts`), surfaced and justified per the design-gate-deviation rule — it is exactly what the `job_notes.origin` schema lock comment foretold ("future origins grow without a migration").
**Why:** lets `createClientNote` delegate to `createJobNote` (the vendor pattern) instead of duplicating the guard+audit.

## D-11.11 — phase-blocking isolation harness (Fork 8)
`scripts/check-client-portal.ts` discharges SI-11d.1/f.1/g.1/i.1 + routing smoke; the seed adds a client user + cross-client fixtures. Phase does not tag/push/merge until green.
**Why:** the vendor phase's harness discipline (pattern 10) applied to the client isolation surface — the security crux is empirically proven, not asserted.
