# Phase 27 — Known Limitations

Each maps to a carry-forward where applicable (`closeout-carryforwards.md`).

- **L-27.1 — No rendered review/publish UI.** The six server actions exist and are harness-proven, but
  there is no operator screen to view a draft, author pricing, see the routing preview, or
  publish/reject/discard. Matches Phase 26 (invoice actions, no UI). → **CF-27.6** (cross-agent
  draft-review surface — invoice + proposal).

- **L-27.2 — The NTE gate is per-proposal, not cumulative.** Each proposal is compared to the job NTE
  on its own; already-published proposals on the same job are not subtracted. Issuing multiple draws
  could individually pass while collectively exceeding the ceiling. Mitigation today: the
  `forceClientReview` override routes a draw to client review. → **CF-27.4** (needs an
  already-committed reader; adjacent to CF-27.2).

- **L-27.3 — Publish is a non-atomic sequence.** `createProposal` + N×`addProposalLineItem` run before
  the finalize txn stamps `published_proposal_id`; a mid-sequence crash can orphan a never-finalized
  `proposals` row (operator-deletable, recoverable). The idempotency guard prevents double-materialize.
  → **CF-27.3** (analogue of CF-26.2, §2.6 accepted).

- **L-27.4 — Phrasing edit-distance is a coarse quality proxy.** The Phase-25 signal classifies
  corrections by normalized Levenshtein on the phrasing projection with conservative MVP thresholds
  (gold ≤ 0.15 / negative ≥ 0.5). It captures *how much the operator re-phrased*, not semantic quality,
  and is not calibrated against real review volume. Matures with Phase-25 calibration as the operator
  pool grows.

- **L-27.5 — `scopePhrasing` is not stored per line item.** `proposal_line_items` has only
  `description`; the per-line `scopePhrasing` is folded into the proposal's `scope_snapshot` (assembled
  at publish) and preserved in the immutable draft JSON, but it is not a queryable per-line column.

- **L-27.6 — No vendor-initiated NTE-increase.** When a vendor needs the ceiling raised, the operator
  uses a change order (which feeds `getEffectiveNte`); there is no agent-drafted, vendor-justified
  NTE-increase record. → **CF-27.1**.

- **L-27.7 — No proposal → invoice link.** A published proposal is not linked to a later client
  invoice; only a `job_billing_events` correlation exists (no FK basis today). → **CF-27.2**.

- **L-27.8 — An internal proposal cannot be promoted to client later.** `internal_billed` is terminal;
  there is no path to reopen a billed internal proposal into the client review flow (it would reopen
  the Batch-2 status buckets). → **CF-27.5**.

- **L-27.9 — Single-shot until correction volume accumulates.** `proposalCorrectionPairs` is near-empty
  today (sparse reviews), so `generateProposal` takes the single-shot path; the few-shot loop only
  engages as gold/positive pairs accumulate. Expected at MVP, not a defect.

- **Honesty note.** `db:check:proposal` (15/0) proves the money-safety + NTE-gate **invariants** and
  the adapter plumbing on a **seeded-fixture + mock** corpus — the model is synthetic and the dollars
  are operator-authored fixtures. No live proposal-quality lift is asserted or implied.
