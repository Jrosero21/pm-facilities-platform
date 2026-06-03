# Phase 24 — Operator SOP

How to read the **AI Agents** page (`/agents`, in the top nav after "Review"). It is the
**readiness-evidence surface**: it shows how the agents have actually behaved, so you can
judge whether autonomy is trustworthy *before* anyone considers enabling it. The page is
read-only and visible to operations-tier roles (tenant_admin / operator).

## The blocks (top to bottom)

1. **Agent activity** — per agent: total runs, succeeded, failed, input/output tokens. The
   baseline "how much is each agent running, and is it succeeding." `dispatch_router_v1`
   appears with runs but **0 tokens** (it's rule-based — no LLM spend; that's correct, not a
   gap).
2. **Approve-as-is rate** — for the review-backed agents (rewriter, scope): of the drafts an
   operator reviewed, what fraction were approved **unchanged** (no edit). A high rate is the
   strongest "this agent is producing what we'd ship anyway" signal — the core readiness
   evidence. **`dispatch_router_v1` shows "N/A — rule-based, no review step"**, *not* 0%: it
   has no draft/review surface, so an approval rate is meaningless for it (a 0% would falsely
   read as "never trusted").
3. **Decision dispositions** — per agent: counts of `queued_for_review` / `auto_executed` /
   `policy_blocked`. Today everything is `queued_for_review` (no live autonomy); `auto_executed`
   / `policy_blocked` populate once autonomy runs.
4. **Autonomous dispatch (dispatch_router_v1)** — the autonomy panel: auto-executed /
   policy-blocked / queued counts. **All zeros today is meaningful and correct** — no
   autonomous dispatch has occurred (the live trigger is unwired). When autonomy is enabled,
   this is where you watch it act.
5. **Cost per agent** — compute-on-read $ per (agent, model), from token counts × model price.
   Rule-based agents (no model) and any unpriced model are **excluded** (unmeasurable, not $0).
6. **Failure points** — per agent: failed-run count + the most recent error messages
   (truncated). Triage surface: *why* an agent is failing.
7. **Run latency** — p50 / p90 / mean of run duration (start → complete). Performance signal.

## Reading it as readiness evidence

Before autonomy is ever considered for an agent, this page is the evidence file:
- a **high, stable approve-as-is rate** over real volume,
- a **low failure rate** with no recurring error pattern,
- **cost** within expectation,

are what justify trusting the agent to act. Until the live trigger is wired (a separate,
deliberate step — see `05-system-workflows.md`), the page is observe-only: the agents draft,
operators review, and the page accumulates the track record. Sparse data early is expected —
the surface fills in as the agents run.
