# Phase 11 — 11b Decisions Locked (Client Portal MVP)

All eight 11a forks resolved. Recommended defaults adopted for MVP; tweaks deferred. Live behavior
won where it contradicted prose (proposals are accept-only; origin is varchar not enum).

## Locked decisions

**Fork 1 — client_users table (migration 0027).** New table mirroring vendor_users, vendor_id→client_id
(FK clients.id), with tenant_id, user_id, timestamps, and the same status/archive column shape vendor_users
uses. Multiple rows per user permitted (a user may be scoped to >1 client). Empty-table create — plain
create-table migration, NOT the populated-table additive-default cadence (pattern 2 does not apply).

**Fork 2 — auth substrate.** getClientScope(userId, tenantId)→Promise<Set<string>> (set of client_id),
requireClient()→ClientAuthContext, both mirroring the vendor twins. Add isClientUser + client predicates
to src/server/role-predicates.ts.

**Fork 3 — session/redirect.** Shared /login. Extend (app)/layout.tsx role-routed redirect:
vendor→/vendor, client→/client, else→/dashboard.

**Fork 4 — client job origination (the one new write path).** Wrapper createClientJob(clientAuthCtx, input)
→ delegates to Phase 4 createJob. NON-NEGOTIABLE SERVER-SIDE INVARIANTS:
  - client_id pinned from scope, NEVER accepted from form
  - source_type='internal_client_portal' pinned server-side
  - location re-validated as belonging to an in-scope client (createJob's LOCATION_CLIENT_MISMATCH is
    defense-in-depth, not the only gate)
Sub-decisions:
  1. Multi-client picker: if user scoped to >1 client, form offers a client picker; server re-validates
     membership against getClientScope before pinning.
  2. Direct-to-queue: client jobs land in the SAME initial status as operator-created jobs; surface
     immediately in operator queue. No new "pending intake" status invented.
  3. Client-supplied fields: problem_description (required) + location (required) + priority (optional).
     primary_trade left NULL for operator classification. NTE left NULL (operator-set).

**Fork 5 — note visibility.** Client note reader filters visibility IN ('client_visible',
'client_and_vendor_visible'). origin='client' needs NO migration (job_notes.origin is varchar(16)).
  - Source of client-visible notes for MVP: operators author notes directly with visibility='client_visible'
    (existing write path). FB-10l.2 (visibility-promotion of existing internal/vendor notes) STAYS DEFERRED
    to operator-portal/workflow phase — NOT pulled into Phase 11.
  - Clients DO write notes in MVP: thin createClientNote, origin='client', default visibility='client_visible',
    out-of-txn single-insert, mirroring createVendorNote. Audit out-of-txn per pattern 3.

**Fork 6 — proposal approval (accept-only).** No approve/reject pair exists; recordProposalAcceptance drives
draft→sent→viewed→accepted; reject is operator-side (withdraw/revise). Client portal: read proposals in
sent/viewed, Accept action calls existing recordProposalAcceptance. NO new Phase 8 writer. No client-side
reject in MVP (client adds note / contacts operator → operator revises).

**Fork 7 — invoice visibility (read-only).** Reuse getClientInvoice / listClientInvoicesForJob /
listClientInvoiceLineItems, scoped to client_id ∈ getClientScope. [VERIFY-LOG: client_invoices scope shape
confirmed in Step 1 — client_id is a DIRECT column (varchar(36), NOT NULL, indexed); no jobs join needed.
Status enum is draft/sent/void → client-visible set excludes draft/void (surface 'sent'+ only).]
Read-only; no writers.

**Fork 8 — harness + seed.** New scripts/check-client-portal.ts, destructive + seed-dependent (pattern 10),
parallel to check-vendor-predicates.ts (not an extension). Seed gains client@phase9seed.test (client_user,
bound to a named seed client), password Phase9-Seed-Pw!.

## Construction slice plan (tentative; inspect-before-construct each slice)
- 11c: migration 0027 client_users + getClientScope/requireClient + isClientUser/predicates
- 11d: role-routed redirect + (client) route group + layout + /client/jobs list (read)
- 11e: /client/jobs/[id] detail (job + client-visible notes; client-appropriate status)
- 11f: /client/jobs/new — createClientJob wrapper (the new write path; scope-pin security crux)
- 11g: createClientNote (client note write)
- 11h: /client/locations (read-only)
- 11i: /client/invoices (read-only) + proposal Accept action
- 11p: closeout (12 docs) + check-client-portal.ts harness + seed client user

## Construction-time verify gates (banked; verify empirically before relying — handoff discipline)
- vendor_users exact column shape (status/archive col name + type) before authoring 0027 — re-inspect at 11c
- Phase 4 createJob exact input signature + error-code set before wrapping — re-inspect at 11f
- recordProposalAcceptance signature + required preconditions before wiring Accept — re-inspect at 11i
- getVendorScope exact return/impl before authoring getClientScope twin — re-inspect at 11c
- client_invoices scope shape — RESOLVED in 11b Step 1

## Carry-forwards confirmed deferred (not Phase 11)
- FB-10l.2 (operator visibility-promotion) — operator-portal/workflow phase
- FB-10l.3 (requires_review workflow) — operator-workflow phase
- Client-side proposal reject — post-MVP (operator revises today)
- Phase 10 carry-forward inventory unchanged by Phase 11
