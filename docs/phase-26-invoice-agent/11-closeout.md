# Phase 26 Closeout — New Agents: the Invoice Creator

## Phase Goal
Begin the v2.9.0 "new agents" arc with the first agent — `invoice_creator_v1` — following the proven
pattern: register → shared runner → reviewable draft → §2.5-v1 gate → policy-able (Phase 23) →
feedback-fed (Phase 25). The agent reads a submitted vendor invoice on a COMPLETED job and drafts the
marked-up client invoice, with money-safety enforced structurally (the LLM writes phrasing, never
numbers). v2.9.0-phase-26 · branch `phase-26-invoice-agent`.

## Completed Deliverables
- **Schema + migration (0047).** `invoice_drafts` + `invoice_reviews` (specialized, mirroring the
  scope substrate). Applied to prod with contract + FK verification (119 → 121 tables).
- **The agent (`invoice_creator_v1`).** Registry entry; `runInvoiceCreator` pipeline on the shared
  runner; a **number-free** zod schema (money-safety as a type constraint); the **vendor-line-driven
  number-join** (every dollar from the vendor invoice; markup the rule preview); the **COMPLETED-job
  eligibility gate**; `lumpFlag` keep-whole behavior. Always queues at `pending_review` — no
  auto-execute.
- **Draft / review / edits data layers.** `createInvoiceDraft` (immutable `proposed_invoice`),
  `createInvoiceReview` (2-row txn gate, audit inside), `resolveEditedInvoice` (null-if-unchanged;
  operators **can** edit numbers — the gold signal).
- **Publish = materialize-to-draft.** `publishInvoiceDraft` materializes an approved draft into a
  `client_invoices` DRAFT via the canonical billing writers (markup re-resolved fresh), idempotency-
  guarded on `published_client_invoice_id`. Issuance stays the existing accounting-gated
  `sendClientInvoice`.
- **Phase-24 + Phase-25 wiring.** `invoiceApproveAsIs` (+ a 4th `agentApproveAsIs` row);
  `invoiceCorrectionPairs` (scope `CAST(... AS CHAR)` JSON path) wired into
  `correctionPairsForAgent`/`allCorrectionPairs`; few-shot wired into the agent. Volume/cost free.
- **Prompt default seed.** `ai_prompt_template_defaults` for the agent (prompt only; **no** policy
  default → fail-safe gated).
- **Phase-blocking harness.** `scripts/check-phase-26.ts` (`db:check:invoice`) — hybrid proof
  (real agent-under-mock for money-safety + direct-seed for harvest/approve-as-is).

## Files Created or Changed
- **New (schema/agent):** `src/server/schema/agents-invoice.ts`;
  `src/server/agents/invoice-creator/{drafts,reviews,edits,tools,llm,prompt,errors,index,publish}.ts`;
  `src/app/(app)/jobs/invoice-actions.ts`; `db/migrations/0047_military_lucky_pierre.sql` (+ snapshot).
- **Changed:** `src/server/schema/index.ts` (barrel); `src/server/agents/registry.ts` (entry);
  `src/server/analytics/correction-pairs.ts` (+`invoiceCorrectionPairs`, union, dispatch, fan-out);
  `src/server/analytics/agent-observability.ts` (+`invoiceApproveAsIs`, 4th row);
  `db/seeds/agent-config.ts` (prompt-only seed; `policy` made optional);
  `package.json` (`db:check:invoice`).
- **New (harness):** `scripts/check-phase-26.ts`.
- **Docs:** `docs/phase-26-invoice-agent/01..11` + `closeout-carryforwards.md`.

## Database Changes
Migration **0047** (`0047_military_lucky_pierre.sql`) — two new tables (`invoice_drafts`,
`invoice_reviews`); applied to prod (119 → 121). FK on-delete: tenant/job/agent_run **CASCADE**,
client/vendor_invoice **RESTRICT**, published_client_invoice **SET NULL** (reviews: tenant/draft
CASCADE, reviewer SET NULL). JSON columns `proposed_invoice` / `edited_content` (MariaDB
`longtext`+`json_valid`). **`0047` is now CONSUMED** (was "left free for the deciding phase"). Full
detail in `08-db-changes.md`.

## API Routes / Server Actions Added
No HTTP routes. Agent entrypoint `runInvoiceCreator`; actions `generateInvoiceAction`,
`approveInvoiceDraftAction`, `rejectInvoiceDraftAction`, `discardInvoiceDraftAction`,
`publishInvoiceDraftAction` (materialize-to-draft). Issuance reuses the existing accounting-gated
`sendClientInvoiceAction` (not authored this phase). Reused billing writers: `createClientInvoice`,
`addClientInvoiceLineItem`, `resolveClientMarkupDefault`, `recalculateClientInvoiceTotals`. See
`09-api-routes.md`.

## User-Facing Workflows Added
Trigger on a completed job with a submitted vendor invoice → review the drafted client invoice → edit
(including numbers / break out a lumped line) → approve → **publish** to a `client_invoices` draft →
accounting **issues** via the existing Send. The AI output is a reviewable draft throughout.

## Admin/Internal Workflows Added
The agent is **gated by default** (`requiresReview` — no policy seeded). Autonomy is **not** enabled
this phase (needs a Phase-23 policy + a live trigger that does not exist, CF-24.2). It surfaces in the
Phase-24 `/agents` evidence and feeds the Phase-25 loop automatically.

## Business Rules Added
LLM emits no dollars (number-free schema); every client-line dollar derives from the vendor invoice
(vendor-line-driven join); markup = rule preview on the draft, re-resolved fresh at publish; lumped
invoice kept whole + flagged, never split; eligibility = COMPLETED job + vendor invoice; operators may
edit numbers at the gate (AI cannot); publish materializes a DRAFT (idempotency-guarded), issuance
stays accounting-gated; fail-safe gated; §2.5-v1 gate intact. See `06-business-rules.md`.

## Chatbot Knowledge Added
What the invoice agent does; the money-safety rule (AI never sets dollars); the review gate; lumpFlag
behavior; publish-to-draft vs. accounting issuance; how corrections feed Phase 25. See
`07-chatbot-knowledge.md`.

## Verification Performed

Commands/results:

```bash
pnpm exec tsc --noEmit            # exit 0 (0 errors) — across all batches
pnpm lint                         # new files clean (0 warnings/errors on Phase-26 files)

pnpm db:check:invoice             # PHASE-26 INVOICE LEDGER GREEN ✓ — passed: 11, failed: 0
                                  #   run 1 (fresh) 11/0; run 2 (idempotent re-run) 11/0
                                  #   GROUP M (money-safety, real join): itemized lines reconcile to
                                  #     vendor unit prices {100.00,250.50}, no fabricated dollar,
                                  #     markup preview-only; lump kept whole at 4200.00
                                  #   GROUP H/A/V: harvest buckets 2/2/1, GOLD-first selector,
                                  #     approve-as-is reviewed=5/approvedAsIs=2, volume surfaces free
pnpm db:check:feedback            # PHASE-25 FEEDBACK LEDGER GREEN ✓ — 13/0 (no cross-contamination)
pnpm db:check:observability       # PHASE-24 OBSERVABILITY LEDGER GREEN ✓ — 28/0 (no cross-contamination)

# Migration: sandbox apply → -E contract-verify → prod-confirm gate → prod apply.
#   Sandbox 119→121; prod 119→121; SHOW CREATE + REFERENTIAL_CONSTRAINTS matrix identical.
```

The other two harnesses passing **unchanged** proves the additive correction-pairs/observability edits
did not disturb the shared `latestReviewPerDraft` primitive, and that the invoice harness tears down
cleanly (fully tenant-scoped, no orphaned rows — including the agent-child `agent_tool_calls` /
`agent_decisions` deleted explicitly under `FK_CHECKS=0`).

## Known Limitations
CF-26.2 (publish partial-failure window — orphaned `client_invoices` DRAFT, operator-deletable,
recoverable; close only with a no-cost guard); CF-26.1 (no agent-assisted breakdown of lazy/lumped
invoices — blocked on no authored vendor rate data; `vendor_rates`/`vendor_performance_scores` exist
but are empty); sign-off / required-documents readiness (Scenario 2/3) **not modeled** (no schema
column); the harness proves money-safety invariants + adapter plumbing on a **seeded/mock** corpus, not
live invoice quality. See `10-known-limitations.md`.

## Carry-Forward Items
**Retires:** **B-16.5** ("LLM-assisted draft phrasing — provider seam + `ai_prompt_templates`")
**PARTIALLY** — the invoice agent's per-agent share is delivered (per-agent retirement **begins** this
phase; B-16.5 was fully OPEN before). **Residual = proposal generator + NTE negotiator.** B-16.5 stays
OPEN with that reduced residual. **New:** **CF-26.1** (lazy/lumped cost breakdown, blocked on no
authored vendor rate data), **CF-26.2** (publish partial-failure window, §2.6 accepted). Everything
else rolls forward OPEN unchanged (CF-25.1–25.4, CF-24.2, CF-23.1 [dep = **CF-12.4**], CF-23.2, CF-22.x
… the full bank). Full ledger in `closeout-carryforwards.md`.

## Recommended Next Phase Focus
**Continue the new-agents arc — the proposal generator** (the next per-agent B-16.5 retirement), then
the **NTE negotiator** (highest-stakes / adversarial — gate longest, possibly forever). Both follow the
same pattern proven here. Orthogonally, the **live autonomy trigger** (CF-24.2) remains the standing
"permission ≠ readiness" decision, now informed by a second high-volume agent's observability evidence.
