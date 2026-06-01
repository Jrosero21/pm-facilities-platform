# Phase 16 — Known Limitations

All are deliberate scope boundaries (service-layer-first, WP-16.1), banked for post-MVP. See
`closeout-carryforwards.md` for the canonical backlog with ids.

| # | Limitation | Banked as |
|---|------------|-----------|
| 1 | **Draft text is deterministic** — composed from job facts (status/location/problem/schedule), not LLM-phrased. The provider seam is wired but no LLM call is made for drafting. | **B-16.5** |
| 2 | **No chat UI** — Phase 16 is the service layer; there is no operator-facing conversational surface yet. | **B-16.3** |
| 3 | **No vendor-direction publish target** — `publishRewriteDraft` publishes client-direction only (`client_update_logs` + `communication_logs`). A `vendor_update`-sourced draft has no built outbound target; it lands `pending_review` but cannot yet be published vendor-side. | **B-16.3** |
| 4 | **No vendor performance reader** — `summarizeVendorPerformance` returns profile only; there is no per-vendor activity/score reader and `vendor_performance_scores` is empty/unpopulated. | **B-16.4** |
| 5 | **No invoice-aging anomaly** — `flagInvoiceAnomalies` checks only negative margin + NTE breach; long-unpaid/aging is not evaluated. | **CF-16.2** |
| 6 | **`source_id` polymorphic meaning** — for assistant drafts `source_id = jobId` (the job is the source), whereas the rewriter's `source_id` points at a note/update row. The chatbot's `agent_id` disambiguates, but the dual meaning of `source_id` across agents should be documented; an optional `source_type` intent-tag enum value is banked. | **CF-16.3** (+ **CF-16.1** for the enum) |
| 7 | **Knowledge is load-at-query-time keyword search** — fine at the current 878-line curated layer, but if the corpus outgrows model context a RAG/embeddings index will be needed. No embeddings infra exists today. | RAG-if-outgrows (carryforwards) |
| 8 | **No autonomous action** — the assistant cannot publish/send/act; every outbound step is human-gated. This is a design invariant (R-16.1), not a gap — listed so it is not mistaken for a TODO. | — (invariant) |

None of these block the phase; the harness (37/0) protects the shipped behavior.
