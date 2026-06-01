# Phase 16 — Business Rules

Each rule cites the harness group (`scripts/check-chatbot-assistant.ts`, 37 assertions, A–F)
that empirically protects it.

| Rule | Statement | Harness group |
|------|-----------|---------------|
| **R-16.1** | The assistant READS and DRAFTS only — it never publishes, sends, or mutates operational state. The only writes are `pending_review` drafts. | **C** (gate: zero client_update_logs/communication_logs created), **F** (only `update_rewrite_drafts` grew; every other table unchanged) |
| **R-16.2** | Every draft lands at `status='pending_review'`, attributed to `chatbot_assistant_v1` via `agent_run_id`, with non-empty content; it stays `pending_review` after the run (the agent cannot advance it). | **C** (C1/C2/C6) |
| **R-16.3** | Every AI tool call is logged to `agent_tool_calls` with the correct `tool_kind` — the 2 draft tools `write`, the 8 read tools `read` — all `status='ok'` on the happy path; the run writes one terminal `agent_runs` row. | **D** (D1–D4) |
| **R-16.4** | Knowledge retrieval is platform-level; all **operational** reads + drafts are tenant-scoped. A tool bound to tenant-A, given a real tenant-B id, returns not-found and creates nothing — no cross-tenant leak. | **E** (E1–E6) |
| **R-16.5** | Document access is allowlisted to `docs/` `.md` files only. Absolute paths, `..` traversal, non-`.md` extensions, and symlink/realpath escapes all throw `DOC_PATH_FORBIDDEN`. | **A** (A-guard ×4) |
| **R-16.6** | An invoice anomaly is exactly: (A) negative job margin (`getJobMargin.margin < 0`) **OR** (B) NTE breach (Σ approved vendor invoices `>` `notToExceedAmount`). Invoice aging is **not** an anomaly this phase. | **C/F** (evaluates without mutation; flagged set derived from existing readers) |
| **R-16.7** | The vendor tool returns **profile/activity summary only**, never a performance score (no per-vendor reader exists; `vendor_performance_scores` is untouched/empty). | **E2** (profile, tenant-scoped), **F6** (`vendor_performance_scores` unchanged) |
| **R-16.8** | The assistant is enumerated as a production agent (`listProductionAgents()` includes `chatbot_assistant_v1`, not `testOnly`). | **A0** |

## Notes

- R-16.1/R-16.2 together encode the §2.5 draft-vs-act gate: AI proposes a `pending_review`
  draft; a human reviews, approves, publishes, and sends. The agent imports no publish/review
  path — the boundary is structural (see `05-system-workflows.md`).
- R-16.4's structural mechanism: operational/draft tools are factories capturing the run's
  `tenantId` in a closure, so the (model-driven) caller cannot supply a foreign `tenantId`.
- R-16.3 is the F16-B realization: AI actions ride the `agent_*` substrate — there is no
  `ai_action_logs` table.
