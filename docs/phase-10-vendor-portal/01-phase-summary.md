# Phase 10 — Vendor Portal MVP · Phase Summary

**Version:** `v1.1.0-phase-10` · **Branch:** `phase-10-vendor-portal` · **Roadmap:** §8

## What Phase 10 is

Phase 10 is the platform's **first first-class external portal**. Where Phases 1–9 built the internal aggregator (operators, dispatchers, accounting), Phase 10 opens a surface for a **new user class — vendor users** — who log in, see only the jobs assigned to their vendor org, and act on them. Its character is the inverse of Phase 9's read-heavy composition: Phase 10 is **write-heavy** (six dispatch transitions, ETA confirmations, notes, photo placeholders, invoice submission), and its central tension is that **vendor writes must respect the existing read substrate** — status updates flow through the existing `job_vendor_assignment_status_history`, notes coexist with operator notes, and nothing a vendor writes becomes client-facing automatically.

The phase is **source-agnostic** (vendor data surfaces regardless of how the work order arrived) and **human-gated** (no agent). Every vendor write is scoped by an explicit `vendor_users` linkage and a `requireVendor` guard.

## What shipped

- **`vendor_users` linkage table** (migration `0025`) — the load-bearing identity gap: maps an auth user → a vendor org within a tenant, many-to-many.
- **`job_notes.origin` column** (migration `0026`) — provenance discriminator for vendor-vs-operator notes.
- **The `(vendor)` route group** + `requireVendor()` guard + `getVendorScope()` resolver + post-login role-routing.
- **Four vendor URLs:** `/vendor/jobs` (list), `/vendor/jobs/[id]` (assignment detail), `/vendor/jobs/[id]/invoices/new` (invoice form), and top-level `/vendor-no-access`.
- **Six dispatch transitions** — accept / decline / confirm-ETA / confirm-schedule / mark-on-site / mark-work-complete — each dual-writing the assignment status-history + an audit row.
- **Vendor notes** with an author-scoped visibility filter; an operator-side origin tag.
- **Photo placeholders** — metadata-only `job_attachments` rows (NULL `file_url` marker); no real upload backend.
- **Vendor invoice submission** — a thin wrapper over Phase 8's `recordVendorInvoice` (totals/NTE/billing-event all reused); `source_type='vendor_portal'`.
- **A 61-assertion regression harness** (`scripts/check-vendor-predicates.ts`).

## What did NOT ship (intentional)

- **Client portal** (Phase 11) · **external portal sync** (Phase 12) · **email parser** (Phase 13).
- **Real photo upload backend** — `FB-10a.4`, deferred indefinitely.
- **Operator visibility-promotion** for vendor notes/attachments — `FB-10l.2`, operator-portal phase.
- **NTE-increase request + vendor quote submission** — `FB-10a.5a` / `FB-10a.5b`, Phase 10.5 or 11.
- **Full AI automation.**

## Deliverables vs roadmap §8 — 10/10 discharged

| # | Deliverable | Sub-batch | Surface |
|---|---|---|---|
| 1 | Vendor user login / access | 10i | shared `/login` → role-routed → `requireVendor` |
| 2 | Vendor assigned-jobs list | 10j | `/vendor/jobs` + `listVendorAssignments` |
| 3 | Vendor job detail | 10k-ui | `/vendor/jobs/[id]` + `getVendorAssignmentDetail` |
| 4 | Accept / decline dispatch | 10k-actions/ui | `acceptDispatch` / `declineDispatch` |
| 5 | Confirm schedule | 10k-actions/ui | `confirmSchedule` (+ `confirmEta`) |
| 6 | Update ETA / status | 10k-actions/ui | `confirmEta` / `markOnSite` / `markWorkComplete` |
| 7 | Add vendor note | 10l | `createVendorNote` + form |
| 8 | Upload photo placeholder | 10m | `createVendorPhotoPlaceholder` (NULL file_url) |
| 9 | Submit invoice | 10n | `submitVendorInvoice` → `recordVendorInvoice` |
| 10 | Operator review of vendor updates | 10k–10n | status-history timeline + visibility/origin tag + AP ladder |

## Acceptance criteria (roadmap §8) — all met

A vendor sees **only** their assigned jobs (scope filter); can update an assigned job's status/details (six transitions); vendor notes are captured as **vendor-originated** (`origin='vendor'`); vendor updates do **not** become client-facing unless allowed (default `internal_only`); an operator can review vendor updates (existing surfaces). See `06-business-rules.md`.

## Closing tag

`v1.1.0-phase-10` — the vendor portal MVP. The first major-version bump since `v1.0.0-phase-9`. Tag lands in 10p-tag (the verification record is in `11-closeout.md`).
