# Phase 11 — Client Portal MVP — Closeout

**Target tag:** `v1.2.0-phase-11` · **Branch:** `phase-11-client-portal` → `main` · **Closed:** 2026-05-30

Phase 11 delivered a client-facing portal: a scoped, authenticated surface where an external client user sees only their own organization's work orders, submits new ones, follows status, exchanges updates, views their locations and issued invoices, and accepts proposals — behind the same defense-in-depth scope substrate the vendor portal proved in Phase 10, with operator-frozen Phase 4–10 surfaces untouched.

## 1. Goal (as stated at open)

Mirror the vendor portal to stand up a client portal MVP: client users authenticate, see ONLY their own client orgs' jobs (scope-isolated), submit work orders, view client-visible notes / proposals / invoices, and accept proposals — without ever seeing another client's data or any operator-only / margin-confidential surface.

## 2. What shipped

| Surface | Route | Reader / writer | Scope guard |
|---|---|---|---|
| Work-order list | `/client/jobs` | `listClientJobs` | `clientScope` ∩ tenant |
| Work-order detail | `/client/jobs/[id]` | `getClientJobDetail` | scope-checked fetch → `notFound()` |
| Submission (WRITE) | `/client/jobs/new` | `createClientJob` → `createJob` | server-pinned client + source |
| Updates (note WRITE) | job detail | `createClientNote` / `listClientJobNotes` | scope + visibility filter |
| Locations | `/client/locations` | `listClientLocationsDetailed` | `clientScope` ∩ tenant |
| Invoices | `/client/invoices` | `listClientInvoicesForClientScope` | scope, OQ-6 total-only |
| Proposal accept (WRITE) | job detail | `acceptClientProposal` → `recordProposalAcceptance` | scope-guard = sole authz |

## 3. Files (high level)

- `src/server/client-scope.ts` — `getClientScope` (impure resolver)
- `src/server/role-predicates.ts` — `isClientUser`
- `src/server/auth-context.ts` — `requireClient` + `ClientAuthContext`
- `src/server/client/*` — 8 readers + 3 write wrappers
- `src/server/job-notes.ts` — `origin` union widened `+'client'` (shared-infra, D-11.10)
- `src/app/(client)/*` — route group, layout, pages, actions
- `src/app/client-no-access/page.tsx` — top-level no-access page
- `src/components/client/*` — `new-job-form`, `client-note-form`, `proposal-accept`
- `db/migrations/0027_*.sql` — `client_users`
- `scripts/check-client-portal.ts`, `scripts/seed-sandbox-phase9*` — harness + client seed

## 4. DB changes

`client_users` (id, tenant_id, user_id, client_id, timestamps; unique `(tenant,user,client)`; index `(tenant,client)`; three cascade FKs). One migration: `0027`. `origin='client'` and `source_type='internal_client_portal'` needed no migration (varchar / existing enum value). See `08-db-changes.md`.

## 5. Routes & workflows

Six client routes + `/client-no-access`; proposals as a section on job detail. Three write paths share the shape **`requireClient` → thin action (identity from ctx) → scope-guard wrapper → Phase-4/8 writer (unchanged)**. Full flows in `05-system-workflows.md`.

## 6. Business rules

Scope isolation (R-11.1–4), submission invariants I1–I5, note visibility filter (R-11.6), accept-only (R-11.9), OQ-6 total-only (R-11.11). Full set in `06-business-rules.md`.

## 7. Chatbot knowledge

`07-chatbot-knowledge.md` — what the portal is, what a client can/can't do or see, routes, the isolation model, and grounding rules for a future client-facing agent (never cross scope; never expose markup/subtotal; writes are drafts).

## 8. Verification

`scripts/check-client-portal.ts` — **57 assertions, 0 failures**, run against a freshly-seeded sandbox at commit **`e5c9d3b`**:

```
[check-client-portal] passed: 57
[check-client-portal] failed: 0
[check-client-portal] ISOLATION LEDGER GREEN ✓ (SI-11d.1 / SI-11f.1 / SI-11g.1 / SI-11i.1 / 11d routing)
```

Assertion groups:
- **scope** — `getClientScope` size 1, contains acme, not globex, unknown→empty.
- **SI-11d.1 (A–F)** — list = acme-only; in-scope present / out-of-scope absent; emptyScope→[]; detail in-scope≠null, **out-of-scope→null (direct-URL isolation)**; out-of-scope notes→[]; in-scope notes = exactly the client-visible markers (internal_only + vendor_visible excluded).
- **OQ-6 (N) + filter (O)** — invoice & proposal rows expose `total`, hide `subtotal`/`markupTotal`; invoices = exactly acme `sent` only, no out-of-scope leak.
- **SI-11f.1 (G–I)** — forged out-of-scope clientId → `CLIENT_SCOPE_MISMATCH`, zero rows; location-under-another-client → throws, zero rows; valid write pins `source_type='internal_client_portal'`, status NEW, client=acme, trade NULL, NTE NULL, created_by=client user.
- **SI-11g.1 (J–K)** — out-of-scope note → `CLIENT_SCOPE_MISMATCH`, zero rows; in-scope note `origin='client'` / `client_visible`, appears in reader.
- **SI-11i.1 (L–M)** — out-of-scope accept → `CLIENT_SCOPE_MISMATCH`, proposal stays `sent`; in-scope accept → `accepted` + `proposal_approvals` row.
- **routing (P)** — `isClientUser` true/false matrix.

Migration 0027 verified twin of `vendor_users` (sandbox + prod). Typecheck green at every batch.

## 9. Known limitations

Accept-only (no reject), priority omitted, list-only invoices, full-HTTP routing smoke residual, multi-client UX lightly exercised, visibility-promotion still operator-manual. Full list in `10-known-limitations.md`.

## 10. Carry-forwards

`closeout-carryforwards.md` — discharged SI items recorded as verified; new CF-11.1–5; inherited Phase-10 items roll forward.

## 11. Recommended next-phase focus

**Phase 12 — external portal / channel integration framework.** Generalize the proven internal vendor + client portals toward external source channels (ServiceChannel as one channel among many), keeping the platform source-agnostic. Build on the `source_type` discriminator + the scope-guard pattern.

## 12. Sign-off

Construction complete; isolation ledger green (57/57 @ `e5c9d3b`); twelve closeout docs written. Push / tag `v1.2.0-phase-11` / merge to `main` / cut `phase-12` branch is the gated B2 step, pending explicit confirm.

---

*Generated as part of the Phase 11 closeout. See the eleven sibling docs + the `11a`/`11b` manifests for full detail.*
