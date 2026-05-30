# Phase 11 — Business Rules

The enforced rules of the client portal. Every rule below is exercised by `scripts/check-client-portal.ts` unless noted.

## Scope & isolation

- **R-11.1 — client scope is the unit of visibility.** A client user sees exactly the client orgs in `getClientScope(userId, tenantId)` (the set of `client_users.client_id` for that user+tenant). Every reader filters `inArray(col, [...clientScope])`; empty scope → `[]` (short-circuit). *(Harness: scope group, A, B.)*
- **R-11.2 — direct-URL isolation.** A detail/read by id re-validates the target's client ∈ scope, not just tenant. `getClientJobDetail` fetches tenant-scoped then returns null unless `clientScope.has(clientId)`; the page calls `notFound()`. A client cannot view another client's job by guessing its URL. *(Harness: C, D.)*
- **R-11.3 — `getClientJobDetail` is the single source of isolation truth.** The detail page, note reader, note writer, and proposal reader/accept all route their scope check through it. One guard, one place to reason about.
- **R-11.4 — defense in depth.** Tenant scoping already filters most leaks; the explicit per-client check is the second layer. Writers re-fetch and re-check rather than trust an id passed in.

## Job submission (write) — invariants I1–I5

- **I1 — `client_id` is pinned server-side** from `clientScope`, re-validated even at scope size 1. A form-supplied `clientId` is a *selection*, never a grant — re-validated ∈ scope before use; a forged/out-of-scope value → `CLIENT_SCOPE_MISMATCH`. *(Harness: G.)*
- **I2 — `source_type='internal_client_portal'` is pinned server-side**, never from the form. *(Harness: I.)*
- **I3 — location ↔ client re-validation, two gates.** The wrapper checks `getLocation` → `location.clientId === clientId && in scope`; `createJob` independently throws `LOCATION_CLIENT_MISMATCH`. A location under another client is rejected. *(Harness: H.)*
- **I4 — a throw writes zero rows.** All gates run before `createJob`'s transaction; `createJob` is itself txn-wrapped. *(Harness: G, H — counts unchanged.)*
- **I5 — `created_by_user_id` is the authenticated user** (`ctx.user.id`), never from the form. *(Harness: I.)*
- **R-11.5 — direct-to-queue.** A client job lands at status **NEW** (hardcoded in `createJob`), unclassified (trade/priority/NTE null). No pending-intake status. *(Harness: I.)*

## Notes / updates

- **R-11.6 — client note visibility filter (Fork 5).** Visible iff `visibility ∈ {client_visible, client_and_vendor_visible}` OR `(origin='client' AND author ∈ client_users-scope)`. `internal_only`, `vendor_visible`, `requires_review` never reach the client. *(Harness: E, F.)*
- **R-11.7 — client write defaults.** A client update lands `origin='client'`, `visibility='client_visible'` (visible to client + operators, NOT auto-pushed to vendors). Out-of-scope job → `CLIENT_SCOPE_MISMATCH`, zero rows. *(Harness: J, K.)*
- **R-11.8 — no auto-promotion.** Setting visibility is operator classification; there is no automatic client→vendor or internal→client promotion (FB-10l.2 open).

## Proposals & invoices

- **R-11.9 — accept-only.** A client sees `status='sent'` proposals on their jobs and may ACCEPT only. No portal reject — the operator revises (Phase-8 revision chain). *(Harness: M; absence of a reject path.)*
- **R-11.10 — accept scope-guard is the sole authz gate.** `recordProposalAcceptance` trusts its caller; `acceptClientProposal` is the only authorization. Out-of-scope `proposalId` → `CLIENT_SCOPE_MISMATCH`, proposal stays `sent` (zero state change). *(Harness: L, M.)*
- **R-11.11 — OQ-6 margin confidentiality.** Client invoice + proposal readers expose the marked-up **total only** — never `subtotal`/`markup_total`/line items. Invoices are `status='sent'` only, scope-filtered, list-only. *(Harness: N, O.)*

## Routing

- **R-11.12 — role-gated entry.** `isClientUser` gates `requireClient`'s redirect; a client user with empty scope or no client role is sent to `/client-no-access`. *(Harness: P + empty/out-of-scope reader denials.)*
