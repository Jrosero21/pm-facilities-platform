# Phase 8 — Known Limitations

What Phase 8 deliberately does NOT do, and the bounded edges of what it does. Each is a conscious decision (cited), not an oversight. Grouped by kind. Open carry-forwards are in `closeout-carryforwards.md` + `11-closeout.md`; this doc is the standing "don't expect X yet" reference.

**CF vs. not:** **substrate-wiring deferrals** (where the platform owes a closure — a missing writer, an unwired column, an absent test harness) carry a **CF handle**; **UI-polish deferrals** (where the operator gets by today and the improvement is welcome but not owed) are noted here **without a CF**. The distinction is marked per item below.

## A. Deferred to a later phase

- **No agent / no NTE negotiator** (OQ-27). The roadmap's Phase-8 "NTE negotiator" was deferred at the 8a gate; the Phase-7 policy resolver (L-7.1) stays inert; the agent-config seed split (Q-7.1) is untriggered. The runner substrate supports an LLM-native tool-use agent unchanged — it's an activation, not a build, for a future phase.
- **No `billing_policies` / dollar-gated approval thresholds** (OQ-21). Approval is role-gated (accounting) + the NTE-breach flag is advisory; there is no "auto-approve under $X" policy layer.
- **No line-level AR↔AP rollup / no `job_scope_steps`↔line-item link** (#4/#15). Margin is per-job only (`getJobMargin` = Σ sent AR − Σ approved AP); no line-to-line cost-to-bill mapping.
- **Markup is internal-only** (OQ-6). The Phase-11 client portal must render the marked-up total, never the cost+markup split. The data layer returns markup columns; hiding them is a UI/portal concern.
- **`vendor_invoices.source_type='email_ingestion'`** is a placeholder; inbound-email invoice ingestion (+ `source_external_id` dedup) is Phase 13 (#5).
- **No proposal auto-expiry** (OQ-8). `valid_until` is computed-on-read; no cron flips proposals to `expired`.
- **Quote-first not supported** (OQ-12). `proposals.job_id` is NOT NULL — a proposal always belongs to a job.

## B. Bounded / placeholder

- **Same-currency MVP** (OQ-2). `currency` is stored per record but never converted; all math assumes `USD`. The NTE override comparison is amount-only (CF-8c.4.1 — add currency to the comparison when multi-currency lands).
- **Tax is placeholder** (#7). `tax_rate`/`tax_amount` are stored and summed but not computed from a rate; `is_tax_exempt` (on `client_billing_rules`) is recorded, not enforced.
- **Emergency NTE multiplier — stored but inert.** The per-client column exists (`client_billing_rules.emergency_nte_multiplier`, 8b-D1) but **no Phase-8 code reads or applies it** — `resolveClientNteRule` does not multiply emergency-priority NTEs, and the 8b-design tenant-default (`1.50`) was never wired. Emergency-priority jobs resolve NTE like any priority. Wiring the multiplier (+ a config home for the tenant default + an admin UI) is deferred.
- **`scope_snapshot` / `scope_delta_snapshot` are text-only** (8b-D5) — no JSON authoring or format discriminator; they're free-text quote artifacts, independent of the operational published scope (D-7.3).
- **No dispute resolution / `under_review` transition** (8c.7 Decision 5; **CF-8c.docs.2** — substrate-wiring deferral). A **disputed** vendor invoice is terminal — there's no writer to resolve it (back to `under_review`/`received` or forward to `approved`); and `under_review`, though in the enum and accepted by the guards (forward-compat), has no Phase-8 writer that transitions into it. A dispute resolved offline has no in-app re-open path. A future dispute-workflow phase adds the transition writers.

## C. Operational gaps (carry-forwards)

- **No overpayment reconciliation** (CF-8c.9.1). Overpayment is allowed (Σ > invoice total → `payment_status` caps at `paid`); there is no `overpaid` status, credit-balance, or refund/reconciliation workflow. Operators reconcile manually; voiding-with-payments is likewise operator responsibility (see `06-business-rules.md`).
- **No client-invoice draft discard** (CF-8c.8.2). Void requires `status='sent'`; a draft created in error has no delete/discard writer — it lingers as a `draft` (excluded from revenue, harmless to margin, but clutter).
- **Vendor-invoice creation is assignment-anchored** (CF-8c.11d.1). An AP invoice is recordable only against an existing `job_vendor_assignments` row (the operator selects a dispatch → `vendorId` + `assignmentId`). A vendor invoice for a non-dispatched job requires creating a dispatch first; a free vendor picker (needs a vendor-list reader) is deferred.
- **`closed_at` is "first close," not a distinct billing-close timestamp** (8c.10). Billing close sets `closed_at` only if null (COALESCE); there is no separate `billing_closed_at`. If the two close moments ever need distinguishing, add a column.
- **Line-item inline-edit UI deferred** (8c.11b–d; **UI-polish, not a CF** — the substrate is ready). The `update*LineItemAction` wrappers exist and are typed/ready, but the editors do add + remove only; inline editing is a future polish (the operator gets by with remove + re-add).
- **Proposal/CO accept/decline capture operator + decision only** (8c.11b–c; **UI-polish, not a CF**). `approverName` / `notes` aren't captured in the UI (the timeline narrates the decision with `actorName`); the data layer accepts them for a future richer form.
- **NTE per-client emergency-multiplier admin UI deferred** (8c.11e). The NTE admin manages per-(client × trade × priority [× location]) rules only; the multiplier-default admin is a separate future surface.

## D. Tooling

- **No standing test framework** (CF-8c.8.3 — no vitest/jest/runner, no `*.test.ts`). The per-sub-batch **ephemeral `scripts/verify-8cN.ts`** scripts are the empirical test layer (run with `--conditions=react-server`, results captured in the commit + docs, then deleted).
- **No runtime role-gate integration test** (CF-8c.8.1, consolidated into CF-8c.8.3). The gate is verified by the `isAccountingRole` unit (pure) + structural gate-survival checks; a true end-to-end HTTP request-flow test needs a request-context harness — `next/navigation` (the redirect) crashes at module-load under `--conditions=react-server`, so tsx can't drive the gate. Blocked on the same missing harness as CF-8c.8.3.
