# Phase 6 — Known Limitations

Everything intentionally not built, done "for now," or worth knowing before later phases. Includes carry-forwards. Inherits the still-load-bearing Phase 1–5 gotchas (InnoDB-must-be-forced, 64-char identifier guard, case/accent-insensitive collation, no tenant-switcher UI, no pagination/search, MariaDB-JSON-as-longtext, the Phase 5 dispatch deferrals).

## L-6.1 — The 5-value visibility enum is declared three times (DRY debt)
`internal_only`/`vendor_visible`/`client_visible`/`client_and_vendor_visible`/`requires_review` is declared on `job_notes`, `dispatch_messages`, and `communication_logs`. The values are identical today and `NoteVisibilityBadge` renders all three sites, so there's no drift — but centralizing the literal into one shared constant is a worthwhile cleanup. **Carry-forward:** extract a single enum constant. (D-6.23/R-6.24.)

## L-6.2 — The rewriter is one-shot (no retry, no streaming)
`generateRewrite` makes a single `generateObject` call. On timeout/rate-limit/parse-fail the run is closed `failed` and the operator re-triggers — **no automatic retry/backoff**, and no token streaming (the operator waits for the whole draft). **Carry-forward (Phase 13):** retry-with-backoff for the bulk/async path.

## L-6.3 — `recipient_type='none'` is unused in Phase 6
The enum includes `none` (a logged communication with no real recipient) but no Phase 6 path produces it. Structural, for future log-style entries. **Carry-forward:** an internal-log communication path if/when needed.

## L-6.4 — `email_templates.applicable_channels` validity is app-layer only
The DB enforces only `json_valid` on the column; that the array contains *valid channel values* is not constrained. No template renderer exists. **Carry-forward (Phase 13):** template rendering + channel-value validation.

## L-6.5 — `vendor_update_logs` + `portal_update_queue` are structural forward-decls
Created (migration 0011) for roadmap completeness but with **no Phase 6 writer, no data layer, no UI**. `vendor_update_logs` is activated **Phase 10** (vendor portal); `portal_update_queue` **Phase 12/13** (client portal push + send pipeline). The Phase 6 "basic update queue concept" deliverable is realized by the **rewriter draft queue** (`update_rewrite_drafts` at `pending_review`), not these tables. (D-6.17.)

## L-6.6 — Ad-hoc compose + inbound-logging UI deferred to Phase 6.5
`outbound_messages`/`inbound_messages` schema exists, but there's no compose-new form and no inbound-logging form. The roadmap has no compose-UI deliverable/acceptance; 6d met the schema deliverable and 6e met "communications tied to jobs." **Carry-forward (6e.5 / Phase 6.5):** the compose + inbound forms (channel-aware, recipient routing). (D-6.25.)

## L-6.7 — `email_templates` has no render/send pipeline
The table + a future management UI only; Mustache substitution and the actual send are Phase 13. **Carry-forward (Phase 13).**

## L-6.8 — Synchronous invocation; ~11 s latency observed
The rewriter runs synchronously in the request; the keeper demo took **~11 s** (above the 2–6 s design estimate), held gracefully by the "Generating…" pending state. Acceptable for one-off operator rewrites. **Carry-forward (Phase 13):** an async/background runner for email-triggered or bulk rewrites.

## L-6.9 — `agent_runs.model` records the routing string (gateway vs direct differ pre-normalization)
The gateway path uses `"anthropic/claude-sonnet-4-6"`; the direct path's bare id (`"claude-sonnet-4-6"`) is normalized to the same provider-qualified form before recording — but a `REWRITER_MODEL` override could record an unnormalized string. **Carry-forward (Phase 9):** analytics grouping by model should normalize the routing prefix (or add a `model_canonical` column). Structural-only observation, not a Phase 6 fix.

## L-6.10 — Cost is tracked but not surfaced
`input_tokens`/`output_tokens` are recorded per run (keeper: 679/232 ≈ $0.0055 at Sonnet 4.6). There is no cost dashboard or budget alerting. **Carry-forward (Phase 9):** cumulative cost analytics from the token columns.

## L-6.11 — `agent_drafts` unification is deferred
Phase 6 ships a **specialized** `update_rewrite_drafts` (domain columns: source pointer, publish link). Whether Phase 7's scope generator shares an `agent_drafts` table or specializes too is **open** — decided then with two data points. (D-6.16.)

## L-6.12 — Per-client `agent_policies` deferred; Phase 6 hardcodes universal review
The `REWRITER_POLICY = { requiresReview: true }` constant is a hardcoded universal policy. Per-client configuration (which clients require review, which allow auto-publish within bounds) is **Phase 7** `agent_policies`. The publish gate is the seam. Acceptance #7 ("never auto-published unless explicit per-client policy allows") holds because that branch never fires in Phase 6. (D-6.13.)

## L-6.13 — MariaDB `json()` reads back as a string (systemic; targeted parse applied)
Drizzle's mysql json type does not parse on read for MariaDB longtext, so json columns round-trip as strings. Fixed where it mattered (`listDraftsForJobDetailed` parses `agent_decisions.metadata`) — but **any future read** of `agent_tool_calls.tool_input/output`, `agent_decisions.metadata`, or `email_templates.applicable_channels` for app logic/UI needs the same parse. **Carry-forward (Phase 6.5 candidate):** a custom drizzle json type with `mapFromDriverValue` to fix it systemically. (R-6.19; `reference-drizzle-sql-fragment-gotchas` #7.)

## L-6.14 — No role restriction on review / approve / publish
Any authenticated operator in the active tenant can approve and publish a rewrite draft. Role-gating (e.g. only tenant_admin publishes) is **Phase 7+** (agent_policies territory). Not constrained prematurely. (Lock 10c.)

## L-6.15 — LLM-native agent tool-use is deferred
The v1 rewriter is a fixed pipeline; an agent that lets the model choose its own tool calls is **Phase 8** (NTE negotiator). The runner substrate supports it unchanged — `registerTool` wraps any function regardless of who decides to call it. (R-6.14.)

## L-6.16 — Setup/test data present (the worked examples)
The `demo` tenant carries Phase 6 worked-example data, left in place: Job #2's **2 notes** (client_visible + requires_review) + **2 communications** (the 6e shared note + the published rewriter update) + the full **persisted agent chain** from the operator-driven keeper demo (1 succeeded `agent_run` w/ real Sonnet 4.6 tokens 679/232, 4 `agent_tool_calls`, 1 `agent_decision`, 1 published `update_rewrite_drafts`, 1 approve `update_rewrite_reviews`, 1 `client_update_logs`, the `audit_logs` rows). Job #1 remains the no-dispatch example. Real, append-only records (`07-chatbot-knowledge.md` K-6.13).

## L-6.17 — The notes-in-timeline filter is page-side / in-memory
The visibility-aware notes filter (R-6.8) runs in the job page over the already-loaded notes + communications, not as a data-layer query. Fine at Phase 6 scale (handfuls per job). **Carry-forward:** refactor to a data-layer `unshared` filter if note volume grows.

## L-6.18 — Inline-SVG icons (6) instead of an icon library
The timeline uses **6** hand-written inline SVG icons (`Created`, `Dispatched`, `Dot`, `Outbound`, `Inbound`, `Note` — all in `job-timeline.tsx`) to keep the no-UI-deps posture; the rest of the Phase 6 UI uses text/Unicode glyphs, not SVG. At 6 icons the set is **well below the ~15 revisit threshold** (the 6c-banked rule). **Carry-forward:** re-evaluate a tree-shakeable icon library (Lucide or similar) only if the set approaches that threshold as new event types / entity icons land in Phase 7+.

## L-6.19 — First external-service dependency (operational fragility)
Phase 6 introduces a hard dependency on an external LLM (gateway or Anthropic). When it's unavailable/rate-limited/timing-out, rewriter runs fail (recorded `agent_runs.status='failed'`; operator re-triggers) — the rest of the app is unaffected (the dependency is isolated behind `llm.ts`). **Carry-forward:** Phase 9 (Aggregator Dashboard & Analytics MVP) monitoring/alerting on agent-run failure rates; Phase 13 retry queue.
