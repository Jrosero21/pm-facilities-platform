# Phase 11 — Known Limitations

Limitations as-shipped. Each maps to a carry-forward in `closeout-carryforwards.md`. None blocks close — the isolation crux is empirically green (57/57 @ `e5c9d3b`).

## MVP scope choices (deliberate)

- **No client-side proposal reject** (CF-11.1). Accept-only; the operator revises via the Phase-8 revision chain. A future portal reject would need to slot into that chain without breaking single-live-revision.
- **No priority on submission** (CF-11.2, D-11.5/F5a). The client form omits the priority picker; `priorityId` is forward-compat in the wrapper but always null. Operator triages priority.
- **List-only invoices** (CF-11.3). No `/client/invoices/[id]` and no line-item view, because line items carry `arMarkupColumns` and a client view of them would breach OQ-6. A detail view would need an OQ-6-safe line projection.

## Verification residuals

- **Full-HTTP routing smoke deferred** (CF-11.4). The harness discharges the routing guard at the *logic* level: the `isClientUser` predicate (assertion P) plus the empty-scope and out-of-scope reader denials. A browser-level redirect smoke (sign-in → `/client-no-access`) needs a request context and is not automated. Low risk — the predicate is the gate's actual decision.
- **Multi-client UX lightly exercised** (CF-11.5). The submission form's multi-client picker and the locations/notes grouping are built and typecheck-clean, but the seed client user is single-client (acme), so the >1-client path is asserted only at the reader/wrapper level (scope re-validation), not via a multi-client seed. Expand the fixture to a two-org client user to exercise the picker end to end.

## Inherited / cross-cutting (roll forward unchanged)

- **Operator client-updates inbox** — no dedicated operator view aggregating `origin='client'` notes across jobs (parallel to the vendor FB-10a.1 gap).
- **Visibility-promotion workflow** (FB-10l.2) still operator-manual — operators author `client_visible` notes directly; there is no "promote this internal note to the client" action.
- **`requires_review` semantics** (FB-10l.3) remain undefined; the client filter simply excludes that visibility.
- **Route-level `loading.tsx` only** — no Suspense-boundary granularity within pages (platform-wide convention).
- **Seed fixture naming** (FB-10p.1) — `seed-sandbox-phase9*` now seeds phases 9+10+11; rename deferred to a boundary.
- **`tenants.type` enum** (FB-10b.1) — `'vendor'` value vestigial; whether to add `'client'` is a schema-hygiene question for a later boundary.
- **Standing watchpoints** — `job_status_history` index growth, TZ-skew discipline in seeds (DB-clock intervals), better-auth NULL-tenant audit rows.
