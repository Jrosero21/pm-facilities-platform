# Phase 11 — Carry-Forwards

The canonical home for every banked item. Discharged items are recorded as verified (not carry-forward); open items roll forward with an id.

## Discharged this phase (verified — NOT carry-forward)

| Id | Item | Evidence |
|---|---|---|
| SI-11d.1 | Read + detail-URL isolation + note-visibility filter | harness A–F, green @ `e5c9d3b` |
| SI-11f.1 | Job-submission write isolation (the central crux) | harness G–I, green |
| SI-11g.1 | Client-note write isolation | harness J–K, green |
| SI-11i.1 | Proposal-accept isolation | harness L–M, green |
| (OQ-6) | Invoice/proposal total-only + sent-only/scope-only filter | harness N–O, green |
| 11d routing (logic) | `isClientUser` predicate + empty/out-of-scope denials | harness P, green |

## New Phase-11 carry-forwards (open)

| Id | Item | Disposition |
|---|---|---|
| CF-11.1 | Client-side proposal **reject** | post-MVP; must fit the Phase-8 revision chain (single-live-revision) |
| CF-11.2 | Priority picker on client submission (F5a) | post-MVP client-triage option; `priorityId` already forward-compat in the wrapper |
| CF-11.3 | `/client/invoices/[id]` + line-item detail | post-MVP; needs an OQ-6-safe line projection (no markup/subtotal) |
| CF-11.4 | Full-HTTP routing smoke | residual; predicate-level discharged (harness P). Automate browser redirect if a harness gains request context |
| CF-11.5 | Multi-client client-user fixture | test expansion; seed a 2-org client user to exercise the picker end to end |

## Inherited (roll forward from Phase 10, unchanged)

| Id | Item |
|---|---|
| FB-10a.1 | Operator vendor-updates inbox (+ a parallel client-updates inbox is now also wanted) |
| FB-10a.3 | Vendor/client invite & onboarding flow |
| FB-10l.2 | Visibility-promotion workflow (still operator-manual; clients read operator-authored `client_visible` notes) |
| FB-10l.3 | `requires_review` visibility semantics undefined |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial; add `'client'`? — schema-hygiene |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds 9+10+11) — schema-hygiene at a boundary |

## Standing watchpoints (roll forward)

- `job_status_history` index growth at scale.
- TZ-skew discipline: seeds anchor timestamps to the DB clock (`NOW() - INTERVAL`), never client-side Dates.
- Route-level `loading.tsx` only — no intra-page Suspense granularity.
- better-auth NULL-tenant audit rows on sign-up.

## Recommended next-phase focus

Phase 12 — an **external portal / channel integration framework**: generalize the now-proven internal vendor + client portals toward external source channels (e.g. ServiceChannel as ONE channel among many), keeping the platform source-agnostic. The `source_type` discriminator + the scope-guard pattern are the foundations to build on.
