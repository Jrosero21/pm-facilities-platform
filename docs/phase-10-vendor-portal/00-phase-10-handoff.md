# Phase 10 — Vendor Portal MVP · Opening Handoff

The orientation document for the next strategic-partner chat. Read it top to bottom before proposing anything; it is the bridge from the just-closed Phase 9 into Phase 10. Structurally analogous to the Phase 8→9 handoff.

---

## Section 1 — The three-party working model

**Jonny** is the human. He runs **Claude Code** in a terminal at `~/Desktop/PM` and is the only one who touches the live machine, the live repo, and the live database. He decides what ships. Address him directly; when something needs a human (an interactive login, a destructive command, a judgment call about scope), ask him to run it or confirm it.

**You (this chat)** are the *strategic partner*. You hold the roadmap, the phase plan, and the architectural through-lines in your head. You propose the work in reviewable batches, write the manifests, reason about trade-offs, and surface decisions. You do not execute against the live machine — you produce the instructions and the plans that Jonny pastes into Claude Code.

**Claude Code** is the *executor*. It inspects files, runs commands, applies edits, runs verification, and reports back. It is literal and careful; it halts at gates and surfaces surprises rather than guessing. The cadence between you and Claude Code is: you specify a small batch → Claude Code executes + reports → you review + specify the next.

**Source-of-truth order (when sources disagree, the earlier wins):** current instruction → the roadmap doc (`docs/roadmap/01-gpt-project-roadmap.md`) → the live repo → the live DB → the current-phase docs → older-phase docs. A corollary proven repeatedly in Phase 9: **empirical truth over prose** — when written guidance and live behavior disagree, live behavior wins, and the guidance gets corrected.

---

## Section 2 — Phase 9 just closed (what you're standing on)

**Phase 9 — Aggregator Dashboard & Analytics MVP** closed cleanly at tag **`v1.0.0-phase-9`** (commit `17cb14a` on `main`), the project's first 1.0. Eight commits across sub-batches 9a–9g. The closeout doc set is `docs/phase-9-aggregator-dashboard-analytics/` — **12 docs** (11 canonical `01`–`11` + `closeout-carryforwards.md`), plus the retained planning docs (`9a-`/`9b-`/`9c-`/`9d-`/`9e-`/`9g-` inspection + manifest).

**What Phase 9 built** — the first complete internal aggregator MVP, a *read-heavy composition phase*:
- `/dashboard` (replacing the Phase-1 stub): 9 role-gated panels — stalled summary, operational queue, status/priority cards, top clients/trades, time-in-status + time-to-dispatch distributions, pending invoices.
- An **analytics reader layer** at `src/server/analytics/` — **9 modules, 10 reader functions**: `operationalQueue`, `countStalledJobs`, `countOpenJobsByStatus`/`ByPriority`, `topClientsByOpenJobs`, `topTradesByOpenJobs`, `countPendingInvoices`, `timeInStatusDistribution`, `timeToDispatchDistribution`, and `isJobStalled` (added 9f). Plus 3 pure modules (`stalled-rules`, `percentile`, `resolve-scheduled-start-at`).
- A **deterministic sandbox seed** (`scripts/seed-sandbox-phase9.ts` + fixture) and a **retained analytics-readers harness** (`scripts/check-analytics-readers.ts`, 23 assertions) — the project's **first standing regression artifact** (a partial answer to CF-8c.8.3).
- Schema gate: **two deferred indexes** (`jobs_tenant_due_idx`, `jobs_tenant_source_idx`, migration `0024`). The `/jobs` filter extension (`?status=`/`?priority=`) and the job-detail "Stalled" aging badge.

**Phase 9 carry-forwards into Phase 10** (full text in `docs/phase-9-aggregator-dashboard-analytics/closeout-carryforwards.md`):
- **CF-9d.6.1** — dispatch-timing seed coverage gap (degenerate-by-design; discharge when the seed is next edited).
- **CF-9e.4.1** — count-vs-labeled-chip `/jobs` filter indicator (discharge on operator-signaled demand).
- **CF-9f.1** — `isJobStalled` not yet in the harness (discharge when the harness is next extended).

**Phase 8 CFs Phase 9 touched:** **CF-8b.1** re-affirmed + extended through migration `0024` (fresh-replay; stays discharged); **CF-8c.8.3** partial answer via the retained harness (stays open). The other eight Phase-8 CFs are billing-specific and untouched.

### The seven foundational principles Phase 9 established that Phase 10 inherits

1. **Read-vs-write role-gating asymmetry.** A read-side panel may extend visibility beyond the corresponding write-side action's role gate when the information is summary-level and management-relevant (e.g. `canSeeFinancials` includes `tenant_admin` for the dashboard read, while billing *actions* don't). **Phase 10's vendor-portal role decisions will face this** — what a vendor can *see* vs *do* are separate gates.
2. **Dual-population rule** (foundational analytics principle). Current-state readers filter `is_archived=false`; historical-distribution readers include since-archived. Any historical analytics Phase 10 surfaces must respect this. (`06-business-rules.md §2`.)
3. **Paired aggregate + single-row reader pattern.** Extract the predicate → build the aggregate reader → add the single-row reader *when a consumer surfaces* (e.g. `isStalled` → `countStalledJobs` → `isJobStalled`). Avoids the "cycle the all-rows aggregate to classify one row" anti-pattern. (Documented in `stalled-jobs.ts` JSDoc.)
4. **Retained harness as regression protection.** `scripts/check-analytics-readers.ts` is the project's first standing regression artifact. Phase 10 may extend it for vendor-portal readers; the **co-versioning contract** (seed + fixture + harness commit together; expectations derive from the fixture, never magic numbers) applies.
5. **Sandbox-targeting env-var override.** Required for `db:migrate` and `npm run dev` only; the seed + harness **self-derive** the sandbox internally. (`04-admin-sop.md §1`.)
6. **Manifest-first cadence with grouped sub-batches.** The inspection → manifest → construction-sub-batches → commit rhythm (9b/9c/9d/9e) is the project-wide discipline. Granularity scales with decision-density: trivial gates compress (9b's 2 indexes = one motion); dense layers spread (9c's reader layer across 9c.1–9c.7). Each sub-batch holds for review at every boundary.
7. **Source-agnostic platform.** Phase 9's dashboard surfaces every `source_type` uniformly (`manual`, `internal_client_portal`, `external_client_portal`, `email_ingestion`, `forwarded_email`, `api`, `preventative_maintenance`, `snow_event`). Phase 10's vendor portal surfaces vendor data **regardless of work-order source**.

---

## Section 3 — The active phase: Phase 10 — Vendor Portal MVP

Roadmap **§8 Phase 10**. Target version **`v1.1.0-phase-10`**. Goal: **let vendor users access and update the jobs assigned to them.**

**Roadmap deliverables:** `/vendor/jobs` (list), `/vendor/jobs/[id]` (detail), `/vendor/invoices/new`, `/vendor/profile`; vendor-user login/access; accept/decline dispatch; confirm schedule; add a vendor note; update ETA/status; a photo-upload placeholder; an invoice-submission placeholder or basic form; operator review of vendor updates.

**Acceptance criteria:** a vendor sees **only** their assigned jobs; can update an assigned job's status/details; vendor notes are captured as *vendor-originated*; vendor updates do **not** automatically become client-facing unless allowed; an operator can review vendor updates.

**Do not build:** the client portal (Phase 11); external-portal sync (Phase 12); the email parser (Phase 13); full AI automation.

**Character of Phase 10 — the inflection point.** This is the platform's **first first-class external portal**: the consumers are **vendor users**, not aggregator users. Where Phase 9 was read-heavy composition over existing data, Phase 10 introduces a **new user surface that creates new data flowing into the existing substrate** — it is write-heavy in places (assignment-status transitions, ETA confirmations, vendor notes, invoice submissions). The central design tension: **vendor writes must respect Phase 9's read substrate.** Status updates from vendors should flow through the existing `job_status_history` / assignment-status-history substrate (not bypass it); vendor-originated notes must coexist with operator notes and surface correctly without breaking aggregator-portal semantics; vendor updates default to *not* client-facing until an operator allows it.

---

## Section 4 — Working rules (carried from Phase 9, plus refinements)

- Work in **small, verifiable batches**: inspect → propose → apply → verify → summarize → continue.
- Do **not** rewrite large parts of the app without first inspecting the current files.
- Do **not** build future-phase features unless (a) required now, (b) avoiding it causes major rework, (c) it's a harmless schema placeholder, or (d) explicitly requested.
- **Preserve auditability** — favor history/event rows over overwrites. *Vendor writes especially:* every vendor mutation should leave an audit trail.
- A phase is **not complete** until the **11 canonical closeout docs + `closeout-carryforwards.md`** exist under `docs/phase-10-vendor-portal/`.
- **Stay inside Phase 10's scope;** flag scope creep explicitly ("this belongs in Phase X, not 10 — defer or include intentionally?").
- The platform is **source-agnostic**; the vendor portal surfaces vendor data regardless of work-order source.
- The vendor portal is for **vendor users**, not aggregator users — role-gating and access scoping are foundational from day one.
- Cite roadmap sections when applying them. When proposing a batch, **list the files you'll touch and why** before touching them.
- **Manifest-first** is the established cadence — open consequential slices with a manifest before building.

**Refinements specifically banked from Phase 9's lessons:**
- **Verify-before-relying gates** for any assumption-shaped pattern. Phase 9's 9d.3 gates (cascade-completeness, `createdAt`-override) and 9d.5 (the populated-reset that caught the inter-child-FK bug) caught real surprises. Apply the same to vendor-side assumptions — e.g. "a vendor user sees jobs through tenant scoping" must be **verified empirically**, not assumed.
- **Tool-output reliability discipline:** file-capture (`> file.out`, then read) for load-bearing assertions; re-probe with corrected inputs on ambiguous feature-test failures; grep against committed text for doc verification. (`04-admin-sop.md §10`.)
- **Empirical-truth-over-prose.** Phase 9 caught this repeatedly: env-override scope, entity IDs as `varchar(36)`, priorities being tenant-scoped, `audit_logs.tenant_id` SET-NULL, inter-child RESTRICT FKs, the `job_statuses.category` vocabulary, the `roles` `key`/`label` columns. When guidance and live behavior disagree, **probe and trust the DB/repo.**
- **Banked-item discipline.** Each manifest's forward-bank notes accumulate across sub-batches; the closeout reconciles every banked item across the canonical doc set (Phase 9 placed all 41). Inherit it.

---

## Section 5 — Technical context

- **Project folder:** `~/Desktop/PM` (fallback `~/Desktop/pm`).
- **Stack:** Next.js 16 / React / TypeScript / drizzle ORM / MariaDB **11.4.10** on Namecheap shared hosting.
- **Database:** `jonnyrosero_pm` via SSH tunnel — `ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com` → host `127.0.0.1:3307`, db `jonnyrosero_pm`, user `jonnyrosero_jonny`. Never put the password in shell history (use the `read -s MYSQL_PWD` pattern). Browser never connects directly to MySQL — server-side DB access only.
- **Sandbox database:** `jonnyrosero_pm_sandbox` (same server) — Jonny's scratchpad. Empty at rest; the seed populates it; tenant-cascade-delete handles idempotency reset. **Not** a production clone — the schema mirrors prod via fresh-replay, but data is seeded separately.
- **Active branch:** `phase-10-vendor-portal`, cut from `main` at `17cb14a` (= `v1.0.0-phase-9`) at Phase 9 close. This handoff doc is its **first commit**; Phase 10 work commits on top.
- **Git conventions:** branch per phase (`phase-N-<name>`); tag per closeout (`vX.Y.0-phase-N`, annotated, embedding the verification record); `main` fast-forwards to each phase closeout (linear history, **no merge commits**); the closeout commit never self-references its own SHA (the hash lives in the tag annotation).
- **Verify-script pattern:** ephemeral `scripts/verify-<name>.ts`, run via `npx tsx --env-file=.env.local --conditions=react-server`, deleted before commit. The retained `scripts/check-analytics-readers.ts` is the exception (the first persistent verify-style script). Phase 10 may add a persistent vendor-portal harness if regression coverage warrants.
- **`DATABASE_URL` sandbox-override** (required for `db:migrate` + `npm run dev`; the seed + harness self-derive):
  ```bash
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')" <npm-command>
  ```
  Full SOP form: `docs/phase-9-aggregator-dashboard-analytics/04-admin-sop.md §1`.
- **TZ-skew watchpoint (banked 9d.6):** mysql2 serializes JS `Date` in the Node-process tz; the DB session tz is `SYSTEM` — the skew = the TZ delta between hosts. Mitigation: server-anchored expressions (`` sql`NOW() - INTERVAL n SECOND` ``, the `agoSql` pattern) **or** UTC strings + `timezone: 'Z'` on the mysql2 pool. Phase 9 uses the first; pool-config adoption of the second is future cleanup. **Phase 10 vendor-write paths should use the same discipline** (don't hand mysql2 a backdated JS `Date` and compare it to `NOW()`).
- **Hand-written-migrator gotcha (banked CF-8b.1):** drizzle init for a hand-written migrator needs positional `drizzle(conn)`, not object-form `drizzle({ client: conn })`. `drizzle-kit` CLI is not subject to this (it manages its own connection). Only relevant if you write a from-scratch migration verifier.

**Phase 9 readers available for reuse** (if the vendor portal needs aggregated reads): `src/server/analytics/{open-jobs,pending-invoices,time-in-status,dispatch-timing,stalled-jobs,operational-queue}.ts` (+ the pure `stalled-rules`/`resolve-scheduled-start-at`/`percentile`). All take an explicit `tenantId`; `requireTenant()` runs at the request boundary, not inside readers.

**Phase 9 shared UI primitives available for reuse:**
- `src/server/role-predicates.ts` — `hasAnyRole`, `canSeeOperations`, `canSeeFinancials`. **Phase 10 will add vendor-side predicates** (likely `isVendorUser` / `canAccessVendorPortal`) composing over `hasAnyRole`.
- `src/components/empty-state.tsx` — shared `EmptyState`.
- `src/components/dashboard/tier-colors.ts` — urgency-tier + status-category color maps (the status-category map may be reusable on vendor surfaces).
- `src/app/(app)/dashboard/loading.tsx` — the route-level loading-skeleton pattern.

**Existing vendor-side substrate to inspect before designing** (Phases 5 + 8): `vendors`, `vendor_locations`, `vendor_contacts`, `vendor_users` / the `vendor_user` role; `job_vendor_assignments` + its status-history (the Phase-5 dispatch substrate — assignment-status vocabulary, accept/decline/schedule/ETA/complete transitions); `vendor_check_ins` (keyed by `assignment_id`); `vendor_invoices` + line items (Phase-8 AP substrate, ready for a submission UI); the `job_notes` table (visibility/origin model); the auth/tenant-context system (`src/server/auth-context.ts`).

---

## Section 6 — First step for this chat

**Open Phase 10 with the 10a design proposal — no code, no schema, no migrations.** Mirror the 9a pattern: enumerate the design surfaces Phase 10 must lock before any build, separate the **consequential forks** that need Jonny's input from the surfaces with an obvious recommendation, and produce a doc that grounds the 10b schema gate (if one is needed) and the 10c+ construction sub-batches.

**Inspect the substrate first** (don't guess): the vendor/auth/role tables above, `job_vendor_assignments` + history, `vendor_check_ins`, `vendor_invoices`, `job_notes`, and "what does an operator see today about vendor updates" in the existing UI. Then draft.

The Phase-10 design surfaces likely include:
- **Route structure** — `/vendor/*` parallel to the aggregator portal? a separate top-level layout / route group?
- **Vendor auth + tenant context** — how does a vendor user resolve "active tenant" when they may work for multiple aggregators? Per-vendor-org, or per aggregator↔vendor relationship?
- **Login/session** — a separate `/vendor/login` or shared with the aggregator portal? cookie scope?
- **Data-visibility scope** — what jobs does a vendor see: per assignment, per vendor-org, per tenant↔vendor relationship?
- **Assignment-status update flow** — accept dispatch → confirm schedule → ETA → on-site → complete, each a `job_vendor_assignments` status-history transition (vocabulary established in Phase 5; Phase 10 surfaces it to vendors).
- **Vendor notes vs operator notes** — same `job_notes` table with an origin/visibility distinction? Roadmap §2.3: vendor updates captured first, reviewed/mapped before becoming client-visible — confirm the data-model affordances.
- **Photo upload** — placeholder; is there an existing attachments table, or a new one? storage approach (local / S3 / placeholder)?
- **Vendor invoice submission** — Phase 8 built the AP schema + readers/writers; Phase 10 surfaces the submission UI.
- **Operator review of vendor updates** — a pending-review queue before propagation, or auto-apply with an audit trail?
- **`vendor_user` permissions** — read-only on assigned jobs; write on their assignment-status / notes / photos / invoices only. Phase 10 establishes these concretely.

**Surface decisions for review rather than guessing. Hold for Jonny's review of the 10a proposal before any commit.**

Hand-off complete — welcome to Phase 10.
