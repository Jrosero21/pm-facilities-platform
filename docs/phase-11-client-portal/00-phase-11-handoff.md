# Phase 11 — Client Portal MVP · Opening Handoff

The orientation document for the next strategic-partner chat. Read it top to bottom before proposing anything; it is the bridge from the just-closed Phase 10 into Phase 11. Structurally analogous to the Phase 9→10 handoff.

---

## Section 1 — The three-party working model

**Jonny** is the human. He runs **Claude Code** in a terminal at `~/Desktop/PM` and is the only one who touches the live machine, the live repo, and the live database. He decides what ships. Address him directly; when something needs a human (an interactive login, a destructive command, a judgment call about scope), ask him to run it or confirm it.

**You (this chat)** are the *strategic partner*. You hold the roadmap, the phase plan, and the architectural through-lines. You propose the work in reviewable batches, write the manifests, reason about trade-offs, and surface decisions. You do not execute against the live machine — you produce the instructions Jonny pastes into Claude Code.

**Claude Code** is the *executor*. It inspects files, runs commands, applies edits, runs verification, and reports back. It is literal and careful; it halts at gates and surfaces surprises rather than guessing. Cadence: you specify a small batch → Claude Code executes + reports → you review + specify the next.

**Source-of-truth order (earlier wins):** current instruction → roadmap (`docs/roadmap/01-gpt-project-roadmap.md`) → live repo → live DB → current-phase docs → older-phase docs. The corollary proven again and again in Phase 10: **empirical truth over prose** — when written guidance and live behavior disagree, live behavior wins, and the guidance gets corrected (Phase 10 did this three times — see §2).

---

## Section 2 — Phase 10 just closed (what you're standing on)

**Phase 10 — Vendor Portal MVP** closed at tag **`v1.1.0-phase-10`** (commit `c85bef3` on `main`), the project's first **external** portal. Fourteen commits across sub-batches 10a–10p. The closeout doc set is `docs/phase-10-vendor-portal/` — **12 canonical docs** (`01`–`11` + `closeout-carryforwards.md`), plus 4 retained planning artifacts (`00-phase-10-handoff`, `10a-inspection-report`, `10a-design-proposal`, `10b-decisions-locked`).

**What Phase 10 built** — the first vendor-facing surface, write-heavy:
- **`vendor_users`** linkage table (migration `0025`) — maps an auth user → a vendor org within a tenant, many-to-many; the identity gap that gated the whole phase.
- **`job_notes.origin`** column (migration `0026`) — provenance discriminator.
- The **`(vendor)` route group** + `requireVendor()` + `getVendorScope()` + post-login role-routing; four URLs (`/vendor/jobs`, `/vendor/jobs/[id]`, `/vendor/jobs/[id]/invoices/new`, top-level `/vendor-no-access`).
- **Six dispatch transitions** (accept/decline/confirm-ETA/confirm-schedule/on-site/work-complete), each dual-writing the status-history + an audit row.
- **Vendor notes** (author-scoped visibility filter + operator origin tag), **photo placeholders** (NULL-file_url metadata rows), **invoice submission** (thin wrapper over Phase 8's `recordVendorInvoice`).
- A **61-assertion regression harness** (`scripts/check-vendor-predicates.ts`) — the project's second standing regression artifact.
- All **10 roadmap §8 vendor deliverables discharged**.

**The three empirical corrections of Phase 10** (the "prose-vs-reality" pattern; full catalog in `docs/phase-10-vendor-portal/02-decisions.md §C`):
1. 10b posited a `history.source` column → it didn't exist → `DoR-10k.1` (provenance in `audit_logs.metadata`).
2. 10b posited operator visibility-promotion → no such action exists → `DoR-10l.1` (review = origin tag + existing ShareNoteButton; promotion banked `FB-10l.2`).
3. Roadmap §8's literal `/vendor/invoices/new` lacked assignment context → `DoR-10n.1` (assignment-scoped route).

**Phase 10 carry-forwards into Phase 11** (full text in `docs/phase-10-vendor-portal/closeout-carryforwards.md`): 21 `FB-…` banks. The ones most likely to matter for Phase 11: **`FB-10l.2`** (operator visibility-promotion — the client portal will surface the *consumer* side of "client-visible" data and may finally force this), **`FB-10a.3`** (operator-side review inbox), **`FB-10i.1`** (dual-role portal switcher — now also relevant for client users), and **`FB-10p.1`** (seed fixture rename — the seed is now Phase-9+10; Phase 11 extends it again).

**Inherited still-open:** `CF-9d.6.1`, `CF-9e.4.1`, `CF-9f.1` (Phase 9); `CF-8b.1` (extended through `0026`), `CF-8c.8.3` (partial — two domain harnesses now exist, still no general framework).

---

## Section 3 — The ten project-level patterns Phase 11 inherits

Phase 10 established these (authoritative in `docs/phase-10-vendor-portal/02-decisions.md §D`). Phase 11 should reuse, not re-derive:

1. **Author-scope-vs-origin discriminator.** Default to author-scope (`created_by ∈` scope subquery) for read filters; add an `origin` column only when *multiple actor-classes* write the same user-set's rows. (Client notes will be a third actor-class on `job_notes` — `origin` already supports it; the read filter extends.)
2. **Populated-table additive-default migration cadence.** `ADD COLUMN ... NOT NULL DEFAULT x` backfills safely; verify empirically post-prod (row count, 0 NULLs). Three executions now (`0024`/`0025`/`0026`).
3. **Audit-write txn discipline.** In-txn audit for multi-write actions; out-of-txn `writeAuditLog` for single-insert.
4. **Id-free declarative seed fixture.** Oracles resolve tenant/vendor/user ids from the DB at runtime — never read ids off the fixture.
5. **Route-group URL-invisibility.** `(client)/client/<route>/page.tsx` serves `/client/<route>` — the literal segment makes the URL. (Phase 10 hit this as a build collision; don't repeat it.)
6. **`drizzle inArray(col, subquery)`** is supported and typechecks.
7. **`audit_logs` shape:** `targetType` + `targetId` + `metadata`.
8. **Insert-id idiom:** match the local template (`$defaultFn` vs explicit `uuidv7()`).
9. **Seed/harness calling `src/server/billing/*`** must dynamic-import after the env-swap (statically-imported `db` binds to prod otherwise).
10. **The pure-predicate + impure-resolver + guard split** (`isVendorUser`/`getVendorScope`/`requireVendor`) — the client portal mirrors it exactly (`isClientUser`/`getClientScope`/`requireClient`).

**Plus the seven Phase 9 foundational principles** (read-vs-write role-gating asymmetry; dual-population rule; paired aggregate+single-row reader; retained harness as regression protection; sandbox-targeting env-var override; manifest-first grouped sub-batch cadence; source-agnostic platform) — all still in force.

---

## Section 4 — The active phase: Phase 11 — Client Portal MVP

Roadmap **§8 Phase 11**. Target version **`v1.2.0-phase-11`**. Goal: **let client users submit and view work orders through the owned client portal.**

**Roadmap deliverables:** `/client/jobs` (list), `/client/jobs/new` (work-order submission), `/client/jobs/[id]` (detail), `/client/locations`, `/client/invoices`; client user access; client work-order submission that **enters the internal aggregator workflow**; client-visible updates governed by rules; proposal-approval placeholder/basic flow; invoice-visibility placeholder/basic flow.

**Acceptance criteria:** a client can submit a work order; the submission enters the internal aggregator workflow (a real `jobs` row, `source_type` reflecting the client portal); the client sees **only client-visible data**; client-visible updates are rule-controlled; an operator can manage client-submitted jobs.

**Do NOT build:** external portal integrations (Phase 12), email parser (Phase 13), snow module, PM module.

**Character of Phase 11 — the symmetric sibling.** Phase 11 is the **near-mirror of Phase 10**, which makes it the cleanest phase to scope: the vendor portal is a working, documented template for nearly every piece.

The likely fork structure (mirrors 10b):
- **`client_users` linkage table** — the `vendor_users` twin. Same shape `(tenant_id, user_id, client_id)`, same cascade FKs, same unique. `client_user` role already seeded (since Phase 1).
- **`(client)` route group** + `requireClient()` + `getClientScope()` + role-routing — direct copies of the `(vendor)` substrate.
- **`client_user` predicates** — `isClientUser` / `canActOnClientJob` / `getClientScope`, composing over `role-predicates.ts`.
- **Client work-order submission** — the genuinely *new* surface: a client creates a `jobs` row via `createJob` (Phase 4), with `source_type='internal_client_portal'` (already in the `jobs.source_type` enum). This is the inverse of Phase 10 (which only acted on existing assignments); Phase 11 *originates* work.
- **Client-visible read filters** — the `job_notes.visibility` axis already supports `client_visible` / `client_and_vendor_visible`; the client read filter is the symmetric counterpart to `DoR-10l.2`'s vendor filter. **This is where `FB-10l.2` (operator visibility-promotion) likely becomes load-bearing** — a client portal that shows "client-visible updates" needs operators to be able to *make* updates client-visible, which Phase 10 deferred.

**The central design tension** (note for the fork doc): unlike vendors (who only see assignments dispatched to them), clients see **jobs they own** — the scope is client-organization → jobs (via `jobs.client_id`), not via an assignment join. And clients *create* jobs, so Phase 11 has a write path that flows into the existing aggregator job workflow rather than a leaf surface. Proposal approval + invoice visibility (client-side AR, the `client_invoices` Phase 8 substrate) are the new read/approve surfaces.

---

## Section 5 — Operating discipline (how Phase 11 should run)

- **Inspect before authoring.** Every construction sub-batch opens with a read-only inspection (the `Na-inspect` pattern). Phase 10 caught all three empirical corrections this way. The client portal's substrate (`client_users` absence, `client_invoices` shape, `createJob`'s source_type handling, the `clients`/`client_locations` tables) must be surveyed empirically before locking forks.
- **Manifest-first, grouped sub-batches.** Inspection → fork-lock (DoRs) → construction sub-batches → closeout. Each holds at a gate.
- **Migrations: sandbox → prod → commit cadence**, with the SQL-inspection halt gate and empirical post-apply verification. Phase 11 likely needs one migration (`0027`, `client_users`) — possibly two if a `client`-origin discriminator is wanted (but per `DoR-10m.1`, `job_notes.origin` may just gain a `'client'` value with no new column).
- **Extend the retained harness** (or start `check-client-predicates.ts`) co-versioned with the seed + fixture. The seed is now Phase-9+10; Phase 11 extends it (and may discharge `FB-10p.1` by renaming).
- **Closeout discipline:** a phase is not complete until all 11 canonical docs + `closeout-carryforwards.md` exist under `docs/phase-11-client-portal/`, the doc-review density gate passes, the tag (`v1.2.0-phase-11`) lands, `main` fast-forwards, and a `phase-12` branch is cut with its handoff.

---

## Section 6 — Technical context (unchanged from Phase 10)

- **Stack:** Next.js / React (App Router), server-side DB access only, better-auth (email+password, drizzle adapter), MySQL/MariaDB on Namecheap via SSH tunnel.
- **Tunnel:** `ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com` · Host `127.0.0.1:3307` · DB `jonnyrosero_pm` (sandbox `jonnyrosero_pm_sandbox`) · user `jonnyrosero_jonny`.
- **Schema lives at `src/server/schema/`** (NOT `src/db/schema/`). Drizzle migrations in `db/migrations/`; `npm run db:generate` is chained (drizzle-kit + `fix-mysql-engine.mjs` + `check-migration-identifiers.mjs`).
- **`mysql -e` vertical output:** use `-E`, not `\G`.
- Full admin procedure: `docs/phase-10-vendor-portal/04-admin-sop.md`.

---

## Section 7 — First step for the next chat

Open Phase 11 with **`11a` — a read-only inspection sweep** mirroring `10a`:
1. Confirm branch `phase-11-client-portal` at `c85bef3`, tree clean, tunnel up.
2. Survey the client substrate empirically: `clients` / `client_locations` / `client_contacts` tables; whether a `client_users` table exists (it should NOT — confirm, the symmetric gap to `vendor_users`); `client_user` role presence; `jobs.source_type` enum (`internal_client_portal` present?); `createJob` signature (`src/server/jobs.ts`) and whether it accepts `source_type`; the `client_invoices` Phase 8 substrate; `job_notes.visibility` client values + whether a client read needs the `origin` column to gain a `'client'` value.
3. Produce two manifests (inspection report + design proposal with the client-portal forks), mirroring `10a`. Lock in `11b`.

The vendor portal is your template at every step — read the corresponding `docs/phase-10-vendor-portal/` doc before designing each client equivalent. The symmetry is the gift Phase 10 leaves you.

**Phase 10 is permanent record. Phase 11 starts here.**
