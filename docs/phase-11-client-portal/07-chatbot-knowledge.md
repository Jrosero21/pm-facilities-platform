# Phase 11 — Chatbot Knowledge (Phase 16 prep)

Structured knowledge for a future client-facing AI agent. AI output is always a reviewable draft, never final (hard rule); an agent operates under policy and never mutates state directly.

## What the client portal is
A scoped, authenticated surface for an aggregator's **clients** (the businesses whose facilities get serviced). A client user signs in and sees only their own organization's work orders, locations, invoices, and proposals. It is the demand-side mirror of the vendor portal (supply side).

## Who a client user is
- Role `client_user`, mapped to one or more client orgs via the `client_users` table.
- Their **scope** is the set of client orgs they are mapped to in the active tenant. Everything they see or do is filtered to that scope.
- A user with the role but no mapping (empty scope) gets "Client portal not available".

## What a client CAN do
- **See** their work orders (list + detail with status, location, description, schedule).
- **Submit** a new work order (location + problem description; the team classifies trade/priority/NTE).
- **Add updates** (notes) on their work orders; **see** team updates marked client-visible.
- **See** their locations (name + address, read-only).
- **See** their issued invoices (total + payment status; list only).
- **Accept** proposals the team has sent on their jobs.

## What a client CANNOT do / see
- Another client's anything (jobs, notes, invoices, proposals, locations) — enforced server-side by scope, including by direct URL.
- Internal/vendor notes (`internal_only`, `vendor_visible`, `requires_review`).
- Invoice or proposal **cost breakdowns** — only the marked-up total (OQ-6 margin confidentiality). No line items, no subtotal, no markup.
- **Decline** a proposal in the portal (accept-only; the operator revises).
- Manage locations, set priority/trade/NTE, see vendor or dispatch data, or any operator surface.

## Routes
`/client/jobs`, `/client/jobs/new`, `/client/jobs/[id]`, `/client/locations`, `/client/invoices`, plus `/client-no-access`. Proposals surface as a section on the job detail page (no standalone route).

## Isolation model (for safe agent grounding)
- A client-portal job is an ordinary `jobs` row with `source_type='internal_client_portal'`, status NEW on arrival.
- A client update is a `job_notes` row with `origin='client'`, `visibility='client_visible'`.
- The agent must never surface data outside the asking user's `clientScope`, and never expose invoice/proposal markup or subtotal. When in doubt about visibility, treat a note as internal.
- Any agent-proposed write (submit a work order, add an update, accept a proposal) is a draft for the user to confirm; the agent does not call the write path directly.

## Rules an agent should know
- Submission pins client + source server-side; the user can only choose among their own orgs/locations.
- Accept is the only proposal action; acceptance is a commitment (revisions come as new proposals).
- Invoices shown are issued (`sent`) only; total only.
