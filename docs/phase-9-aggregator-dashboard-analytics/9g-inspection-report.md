# 9g.1 — Closeout inspection sweep

Read-only grounding for the twelve closeout docs (9g.2). Factual; no doc-writing here. All Phase-9 construction is committed at `3966c4a`; baseline `tsc`/`lint`/`build` green; prod + sandbox verified (Section 4/6).

---

## Section 1 — Phase 8 closeout template (structure to mirror)

`docs/phase-8-billing-proposals/` holds **11 canonical docs (01–11, 38–74 lines each)** + 3 letter-prefixed planning docs (`8a-design-proposal` 567 / `8b-schema-plan` 348 / `8c-construction-plan` 352) + `closeout-carryforwards.md` (117). Conventions:

- **Every canonical doc opens** `# Phase 8 — <Title> · <DocType>` (or `# Phase 8 — <DocType>`); the summary + closeout carry a `**Version:** … · **Branch:** … · **Roadmap/HEAD:** …` line.
- **01-phase-summary** — "What Phase 8 is" (2–3 framing paras) + "What shipped" (layered bullets by sub-batch). ~52 lines.
- **02-decisions** — grouped by gate (`## A. Design-gate (8a)`, `## B. Schema (8b)`, …); each decision a bullet `**ID — one-line.** **Why:** …`, citing OQ/sub-batch.
- **06-business-rules** — headed by domain (`## NTE`, …); bulleted rules, each "enforced by the data layer (not convention)"; cross-refs to `03-user-sop`/`10`.
- **08-db-changes** — a `Migration → table map` table; opening line counts migrations + tables.
- **10-known-limitations** — "what it deliberately does NOT do"; the **CF-vs-not distinction** stated up front (substrate-wiring deferrals get a CF handle; UI-polish deferrals don't); grouped `## A. Deferred to a later phase` / `## B. Bounded/placeholder`.
- **11-closeout** — `Version/Branch/Construction HEAD`; "What delivered"; a **Commit ledger table** (`commit | sub-batch`); verification record.
- **closeout-carryforwards** — one `## CF-<id>` section per item with **What / Obligation / Blocker / Refs**, and a `**RESOLVED (<where>).**` line appended when discharged. IDs like `CF-8b.1`, `CF-8c.4.1`.

**Roadmap §10 template:** Phase 8 followed it and *evolved* it — the annotated-tag-as-verification-record (CF-8b.1 result embedded in the tag) and the separate `closeout-carryforwards.md` ledger are Phase-8 refinements beyond the bare §10 template. Phase 9 inherits the evolved form.

**⚠️ NAMING COLLISION (must resolve in 9g.2):** Phase 9's planning docs are **mixed-prefixed** — `00-inspection-report.md` + `01-design-proposal.md` (number-prefixed, the 9a pair) then `9b-/9c-/9d-/9e-…` (sub-batch-prefixed). **`01-design-proposal.md` occupies the `01-` slot the canonical `01-phase-summary.md` needs.** Phase 8 avoided this by letter-prefixing all planning docs (`8a/8b/8c`). **Recommended fix (9g.2, before writing canonical docs):** `git mv 00-inspection-report.md 9a-inspection-report.md` and `git mv 01-design-proposal.md 9a-design-proposal.md` — frees `00/01`, makes all planning docs sub-batch-prefixed (the 9c/9d/9e inspection+manifest docs already are). Then write canonical `01-…11-` + `closeout-carryforwards.md`.

---

## Section 2 — Phase 9 banked-item inventory (the doc-writing checklist)

Every distinct bank-note across 9a–9f, with its categorized target doc. **D** = 02-decisions (established convention) · **BR** = 06-business-rules · **KL** = 10-known-limitations/watchpoint · **CF** = closeout-carryforwards (future-phase work) · **SOP** = 04-admin-sop · **CHAT** = 07-chatbot-knowledge · **other** as noted.

| # | Src | Item | Target |
|---|-----|------|--------|
| 1 | 9a | "Lights up as data flows" — overdue + SCHEDULED-stalled tiers depend on operator-populated NULL columns (`due_at`/`scheduled_start_at`); built+correct, quiet until data accrues (NOT degraded) | BR + CHAT |
| 2 | 9a | Threshold structure = single constants module (`stalled-rules.ts`); lift-to-table when tenant-configurable thresholds wanted | D + KL(future) |
| 3 | 9a | compute-on-read (no materialization) + the 2 deferred indexes added in 9b | D + 08-db |
| 4 | 9a | 6 design forks resolved (single-page `/dashboard`; queue distinct from `/jobs`; card shapes; read-time stalled classifier; compute-on-read; retained seed) | D |
| 5 | 9a | §7 self-correction: pending-invoice substrate = invoice tables' `status`/`payment_status`, NOT `job_billing_events` → add one-line pointer to `01-design-proposal §7` (now `9a-…`) at closeout | doc-fix (9g.2) |
| 6 | 9b | Sandbox-migrate env-var `DATABASE_URL`-override pattern (template for schema gates) | SOP |
| 7 | 9b | The 2 indexes `jobs_tenant_due_idx (tenant_id,due_at)` + `jobs_tenant_source_idx (tenant_id,source_type)` | 08-db |
| 8 | 9b | CF-8b.1 fresh-replay methodology re-affirmed/extended through migration `0024` (9b.3.3) | 11-closeout (traceability) |
| 9 | 9c | Deferred index `job_status_history (tenant_id, job_id, created_at)` — time-in-status filesort scale watchpoint | KL |
| 10 | 9c | Pending-invoice predicates: strict AP (`approved`+unpaid) / AR (`sent`+unpaid); `received`/`under_review`/`disputed`/`paid` excluded | BR |
| 11 | 9c | Open-population = `is_terminal=false AND is_archived=false` | BR |
| 12 | 9c | **Dual-population rule** (current-state readers exclude archived; historical-distribution readers include since-archived) — foundational analytics principle (recurs Ph14/15/chatbot) | BR |
| 13 | 9c | SCHEDULED-stalled on-site predicate (>2h past resolved scheduled-start AND zero `vendor_check_ins`) | BR |
| 14 | 9c | Completed-intervals-only + right-censoring justification (distribution readers) | BR |
| 15 | 9c | Reader-construction discipline (surface operationally-correct refinements at the sub-batch gate; fold back into manifest before commit) | D |
| 16 | 9c | Explicit-`tenantId`-param convention (inherited Phase 8); app-side percentile decision; app-side queue tier classification (documented deviation from "SQL does the work"); MariaDB 11.4.10 engine baseline | D |
| 17 | 9c | 9c adds **no routes** (readers consumed directly by 9e RSC) | 09-api-routes |
| 18 | 9c | analytics-readers-mirror-billing-readers; "lights up as data flows" empty-state semantics | CHAT |
| 19 | 9c | `vendor_check_ins` keyed by `assignment_id` only (corrects 9c.1 §2.B) | 08-db / 05-workflows |
| 20 | 9c | Tool-output reliability note (3 anomalies; file-capture / grep-committed-text / re-probe discipline) | KL |
| 21 | 9d | **mysql2 ↔ DB timezone skew** (client serializes JS Date in Node tz; DB session tz `SYSTEM`) — verbatim framing; fix = server-anchored `NOW()-INTERVAL` or mysql2 `timezone:'Z'` | **D + KL** |
| 22 | 9d | Explicit ordered-delete reset + `FOREIGN_KEY_CHECKS=0`; Gate-1 lesson (tenant_id-FK survey necessary-but-insufficient; survey inter-child RESTRICT FKs too) | SOP + D |
| 23 | 9d | Dynamic-import sandbox-guard pattern (swap `DATABASE_URL` before `await import("@/server/db")`; refuse non-`_sandbox`) | SOP |
| 24 | 9d | Matcher-facet pre-extraction discipline | SOP |
| 25 | 9d | better-auth NULL-tenant audit rows frozen across re-runs (user-upsert keeps count stable; invariant = "no growth", not "=0") | KL + SOP |
| 26 | 9d | Threshold-boundary seed-coverage discipline (place data AT thresholds, not buffered) | SOP |
| 27 | 9d | Cascade-completeness pre-check pattern (read-only `REFERENTIAL_CONSTRAINTS` survey, prod+sandbox) | SOP |
| 28 | 9d | §1 hard-rule compliance: only read-only `information_schema` prod queries all phase; all writes sandbox-scoped | 11-closeout |
| 29 | 9d | `db:check:analytics-readers` npm alias (the retained harness invocation) | SOP |
| 30 | 9d | Seed + harness = the project's **first standing regression artifact** → **partial** answer to CF-8c.8.3 | KL (CF-8c.8.3 partial) |
| 31 | 9d | dispatch-timing distribution degenerate-by-design (closed jobs get no assignments; `dispatchAfterHours` vestigial) — strengthen when seed next edited | CF |
| 32 | 9e | `DATABASE_URL` inline-override extends to `npm run dev` (full sandbox-targeting SOP across migrate/check/dev) | SOP |
| 33 | 9e | **Read-vs-write role-gating asymmetry** (read gates extend visibility for summary-level info; write gates stay strict) — verbatim foundational principle | D |
| 34 | 9e | Six 9e dispositions (palette-inheritance hard constraint; role-gating both-primitive-and-named; additive `listJobs`; async `searchParams` convention; implicit-dynamic-via-cookies; EmptyState establishment; loading-state (b)) | D |
| 35 | 9e | 9e.3 primitives established (`role-predicates.ts` first read-side role primitive; `empty-state.tsx` first shared empty-state; `loading.tsx` first route-level affordance; tier-colors `Record<UrgencyTier>` compile-time enforcement) — inheritable by Ph10/11 portals | D |
| 36 | 9e | Color mappings: urgency-tier→color + status-category→color ("do not vary per page" invariant) | BR |
| 37 | 9e | Count-in-heading pattern (list/table headings carry a row-count anchor) | BR/UX |
| 38 | 9e | Loading-state route-level only (option b) — future-scale watchpoint (refine to per-panel Suspense (c) when latency warrants) | KL |
| 39 | 9e | Filter indicator = count+clear, not labeled chip (honors IDs-only `resolveJobsFilters`); labeled-chip = future UX refinement | CF + D |
| 40 | 9f | **Paired aggregate + single-row reader pattern** (`isStalled` predicate → `countStalledJobs` aggregate → `isJobStalled` single-row, added when a consumer surfaced) | D |
| 41 | 9f | 9f harness gap — `isJobStalled` (10th reader) not covered by the 23-assertion harness; extend seed/harness later (low priority; cross-surface consistency is load-bearing) | CF + KL |

---

## Section 3 — Phase 8 carry-forwards: discharged / touched by Phase 9

Open Phase-8 CFs at `v0.9.0-phase-8`: **CF-8b.1, CF-8c.1.1, CF-8c.4.1, CF-8c.6.1, CF-8c.8.1, CF-8c.8.2, CF-8c.8.3, CF-8c.9.1, CF-8c.docs.1, CF-8c.docs.2** (CF-8c.7.1 was already RESOLVED in 8c.8).

Phase 9 touched exactly **two**:
- **CF-8b.1** — already *PASSED* at Phase-8 close (tag annotation). Phase 9's 9b **re-affirmed/extended** the fresh-replay methodology through new migration `0024` (9b.3.3). Phase 9 closeout records this as a traceability note, not a re-discharge.
- **CF-8c.8.3** (no test framework) — Phase 9 delivers the seed + retained `check-analytics-readers` harness = the **first standing regression artifact**, a **partial** answer (still no full runner/CI; `isJobStalled` uncovered per item 41). Phase 9 closeout notes the partial progress; CF-8c.8.3 **stays open** in Phase 8's ledger.

The other **eight** are billing-specific, untouched by Phase 9 → **remain open in Phase 8's ledger; Phase 9 does NOT re-list them** (per the no-re-list rule). Phase 9's `closeout-carryforwards.md` carries only Phase-9-originated CFs (items 31, 39, 41 + any others categorized CF) + the two traceability references above.

---

## Section 4 — Verification record (captured for 11-closeout + the tag annotation)

- **Prod schema @ `3966c4a`:** `__drizzle_migrations` = **25** ✓ (24 from Ph8 `0000–0023` + Ph9 `0024`); `jobs` distinct indexes = **16** ✓; **both** `jobs_tenant_due_idx` + `jobs_tenant_source_idx` present ✓.
- **Code:** `tsc --noEmit` **0** · `npm run lint` **0** · `npm run build` **✓ Compiled**, `/dashboard` + `/jobs` both **ƒ Dynamic** ✓.
- **Analytics regression:** `db:check:analytics-readers` → **23/23** (confirmed at 9e.5/9f).
- **Sandbox:** seed tenant `019e7573-4e29-70e7-84c5-d3d4ea134dcd` present, **35** jobs ✓ (no drift).

These mirror Phase 8's tag-annotation verification block (which embedded the CF-8b.1 result).

---

## Section 5 — Branch + merge + tag plan

- **Remote:** `origin` → `github.com/Jrosero21/pm-facilities-platform`. **main HEAD = `23e250c`** (= `origin/main`, in sync; the Phase-8 tagged commit).
- **Branch is a linear continuation:** `phase-9-…` has **7 commits** ahead (`4484a36 9a → d5839dd → a648c52 9b → 2ae0576 9c → 08b77f1 9d → d53405b 9e → 3966c4a 9f`); `4484a36`'s parent is `23e250c`. The closeout doc commit will be the 8th.
- **Merge convention = LINEAR / fast-forward.** `git log --merges main` is **empty** → no merge commits in history; prior phases fast-forwarded. **9g.5: fast-forward `main` to the phase-9 closeout commit** (no `--no-ff`).
- **Tag:** **`v1.0.0-phase-9`** (the project's first major-version tag — v0.5→v0.9 were the prior phases), **annotated**, on the closeout commit (= main's new tip after FF), carrying the Section-4 verification record per the Phase-8 annotation pattern.
- **Phase 10 branch:** cut **`phase-10-vendor-portal`** off the tagged commit on `main`; push branch + tag to `origin`. (Per the standing closeout convention: end the session on the fresh next-phase branch.)
- **Push:** per the standing rule, the closed `phase-9-…` branch + `main` + the tag get pushed; never force-push the closed branch.

---

## Section 6 — Baseline + sandbox state
- Baseline @ `3966c4a`: `tsc` **0** · `lint` **0** · `build` **clean** (✓ above). Working tree **clean**.
- Sandbox: seed tenant present, **35** jobs — **no drift**; re-seed not needed for the closeout (sandbox isn't production state).

---

## Surprises
1. **`01-` slot collision** (Section 1) — the only real blocker for 9g.2; needs the `git mv` rename of the two 9a planning docs before canonical docs are written.
2. **9a design-proposal §7 self-correction** (item 5) — the design proposal still sources pending-invoice counts from `job_billing_events`; 9c §4 corrected it to the invoice tables. The closeout pass owes the one-line pointer in `9a-design-proposal.md §7` (already flagged in 9c-manifest §12 as "added at closeout").
3. **First major-version tag** — `v1.0.0-phase-9` crosses from 0.x to 1.0 (prior tags were `v0.5`–`v0.9`). Worth confirming the 1.0 bump is intended (Phase 9 = "first complete internal aggregator MVP" per 9a §1 framing supports it), but flagging since it's a version-semantics decision.
4. No code/schema surprises — all verification matched expectations exactly (25 migrations, 16 indexes, 23/23, 35 jobs).
