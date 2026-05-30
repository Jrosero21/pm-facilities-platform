# Phase 11 — Client Portal MVP — Phase Summary

**Branch:** `phase-11-client-portal` · **Target tag:** `v1.2.0-phase-11` · **Status at this doc:** construction complete, isolation harness green (57/57 @ `e5c9d3b`), docs in progress.

Phase 11 delivered a client-facing portal: a scoped, authenticated surface where an external client user sees only their own organization's jobs, submits new work orders, follows status, exchanges updates, views their locations and issued invoices, and accepts proposals — all behind the same defense-in-depth scope substrate the vendor portal proved in Phase 10, with operator-frozen Phase 4–10 surfaces untouched.

## What shipped (6 surfaces, 2 net-new write paths + 1 accept)

| Surface | Route | Reader / writer | Scope guard |
|---|---|---|---|
| Work-order list | `/client/jobs` | `listClientJobs` | `clientScope` ∩ tenant |
| Work-order detail | `/client/jobs/[id]` | `getClientJobDetail` | scope-checked fetch → `notFound()` |
| Work-order submission (WRITE) | `/client/jobs/new` | `createClientJob` → `createJob` | server-pinned `client_id` + `source_type` |
| Client updates (note WRITE) | on job detail | `createClientNote` / `listClientJobNotes` | scope + visibility filter |
| Locations | `/client/locations` | `listClientLocationsDetailed` | `clientScope` ∩ tenant |
| Invoices | `/client/invoices` | `listClientInvoicesForClientScope` | `clientScope`, OQ-6 total-only |
| Proposal accept (WRITE) | on job detail | `acceptClientProposal` → `recordProposalAcceptance` | scope-guard is sole authz gate |

## Substrate added

- **`client_users`** table (migration `0027`) — the lean twin of `vendor_users`: `(id, tenant_id, user_id, client_id, timestamps)`, unique `(tenant, user, client)`, index `(tenant, client)`, three cascade FKs. Prod-applied.
- **Auth substrate** — `getClientScope` (impure resolver), `requireClient()` + `ClientAuthContext`, `isClientUser` predicate. Mirrors the vendor triad exactly.
- **`origin='client'`** — `job_notes.origin` (varchar(16)) accepted the new value with no migration; the `CreateJobNoteInput.origin` union was widened one word (`+'client'`), the schema lock's documented intent.
- **`source_type='internal_client_portal'`** — already a valid `jobs.source_type` enum value (Phase 4 forward-declared); the client submission path pins it.

## Key invariants

- **Scope isolation** — every read filters by `inArray(col, [...clientScope])`; every write re-validates the target's client ∈ scope before mutating. `getClientJobDetail` is the single source of isolation truth (reused by the detail page, note reader/writer, and proposal reader).
- **OQ-6 margin confidentiality** — client invoice + proposal readers expose the marked-up **total only**, never `subtotal`/`markup_total`/line items (a documented Phase-8 contract).
- **Source-agnostic** — a client-portal job is just a `jobs` row with `source_type='internal_client_portal'`; it enters the same operator queue at status NEW. No architecture centers on the channel.

## Empirical close evidence

`scripts/check-client-portal.ts` — **57 assertions, 0 failures** (`e5c9d3b`), discharging the full deferred-verification ledger: SI-11d.1 (read + detail-URL isolation), SI-11f.1 (job-submission write isolation), SI-11g.1 (note-write isolation), SI-11i.1 (proposal-accept isolation), OQ-6 shape, and the `isClientUser` routing-predicate smoke. See `09-verification-evidence` / `11-closeout`.
