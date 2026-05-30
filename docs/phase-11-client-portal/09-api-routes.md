# Phase 11 — Routes, Actions & Server Functions

## Pages (`src/app/(client)/`)

| Route | File | Reads |
|---|---|---|
| `/client/jobs` | `client/jobs/page.tsx` (+ `loading.tsx`) | `listClientJobs` |
| `/client/jobs/new` | `client/jobs/new/page.tsx` | `listClientsInScope`, `listClientScopedLocations` |
| `/client/jobs/[id]` | `client/jobs/[id]/page.tsx` (+ `loading.tsx`) | `getClientJobDetail`, `listClientJobNotes`, `listClientJobProposals` |
| `/client/locations` | `client/locations/page.tsx` (+ `loading.tsx`) | `listClientLocationsDetailed` |
| `/client/invoices` | `client/invoices/page.tsx` (+ `loading.tsx`) | `listClientInvoicesForClientScope` |
| `/client-no-access` | `app/client-no-access/page.tsx` | — (top-level, static) |

Layout: `(client)/layout.tsx` (`requireClient` + nav). `(app)/layout.tsx` gained the client-redirect branch.

## Server actions (`"use server"`)

| Action | File | Wraps | Returns |
|---|---|---|---|
| `createClientJobAction(_prev, formData)` | `client/jobs/new/actions.ts` | `createClientJob` | `{error}` or `redirect` |
| `createClientNoteAction(jobId, _prev, formData)` | `client/jobs/[id]/actions.ts` | `createClientNote` | `{error}` |
| `acceptProposalAction(jobId, proposalId, _prev, formData)` | `client/jobs/[id]/actions.ts` | `acceptClientProposal` | `{error}` |

All actions: `requireClient()`, identity from ctx only, known-domain-error → `{error}` (else re-throw), `revalidatePath`.

## Server functions (`src/server/`)

**Auth substrate**
- `client-scope.ts` — `getClientScope(userId, tenantId): Promise<Set<string>>`
- `auth-context.ts` — `requireClient(): Promise<ClientAuthContext>`
- `role-predicates.ts` — `isClientUser(ctx): boolean`

**Readers (`src/server/client/`)**
- `list-client-jobs.ts` — `listClientJobs(tenantId, clientScope)` (job-primary; client-safe columns)
- `get-client-job-detail.ts` — `getClientJobDetail(tenantId, jobId, clientScope)` (scope-guarded; the isolation truth)
- `list-client-job-notes.ts` — `listClientJobNotes(tenantId, jobId, clientScope)` (visibility filter)
- `list-clients-in-scope.ts` — `listClientsInScope(tenantId, clientScope)` (form picker)
- `list-client-scoped-locations.ts` — `listClientScopedLocations(tenantId, clientScope)` (form picker)
- `list-client-scoped-locations-detailed.ts` — `listClientLocationsDetailed(tenantId, clientScope)` (locations page)
- `list-client-invoices.ts` — `listClientInvoicesForClientScope(tenantId, clientScope)` (OQ-6 total-only)
- `list-client-job-proposals.ts` — `listClientJobProposals(tenantId, jobId, clientScope)` (sent-only, OQ-6 total-only)

**Writers (`src/server/client/`)** — all thin scope-guard + delegate
- `create-client-job.ts` — `createClientJob(input)` → `createJob` (I1–I5; `CLIENT_SCOPE_MISMATCH`)
- `create-client-note.ts` — `createClientNote(input)` → `createJobNote` (`origin='client'`, `client_visible`)
- `accept-client-proposal.ts` — `acceptClientProposal(input)` → `recordProposalAcceptance` (sole authz gate)

**Components (`src/components/client/`)**: `new-job-form.tsx`, `client-note-form.tsx`, `proposal-accept.tsx`.

## Error vocabulary
`CLIENT_SCOPE_MISMATCH` (new this phase) — out-of-scope client/job/proposal. Plus reused Phase-4/8 errors surfaced by the wrappers: `LOCATION_CLIENT_MISMATCH`, `LOCATION_NOT_FOUND`, `JOB_NOT_FOUND`, `ProposalNotSent`.
