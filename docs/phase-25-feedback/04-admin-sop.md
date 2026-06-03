# Phase 25 — Admin / Tenant SOP

The feedback loop is **on by default** and requires no configuration. This SOP explains what an admin
should understand about its behavior per tenant.

## How it activates

- The loop runs automatically inside the existing agent pipeline. When the rewriter or scope
  generator runs (on the real, non-mock path), it harvests the tenant's accumulated correction pairs
  and injects the best ones as few-shot examples before calling the model. There is **no toggle** —
  it is part of how those agents draft now.
- **Tenant-scoped.** An agent only ever sees corrections from its **own tenant**. One tenant's edits
  never leak into another tenant's prompts.
- **Per-agent.** The rewriter learns from rewriter reviews; the scope generator learns from scope
  reviews. They do not share corpora.

## What to expect by tenant maturity

- **Fresh tenant / no review history → identical to pre-Phase-25 behavior.** With zero correction
  pairs, the agent falls back to the exact single-shot prompt it used before. No behavior change, no
  risk — the empty-set path is byte-for-byte the old path.
- **As reviews accumulate → drafts sharpen.** Once a tenant has gold (edit-then-approve) and positive
  (approve-as-is) pairs, the agent's first drafts begin reflecting them. Gold pairs are weighted
  first; up to 20 examples are injected per agent.
- **Rejects do not yet feed the agent.** Rejected drafts are recorded but not injected (banked for a
  future contrastive-eval rung).

## The mock / dev path

On the mock path (`REWRITER_MOCK` / `SCOPE_GEN_MOCK`, or no API key) the agent returns its
deterministic stub and **skips** the correction harvest entirely (no DB read, no injection). Few-shot
only applies to real LLM runs.

## Boundaries an admin should know

- **AI output is still a reviewable draft** — the §2.5-v1 gate is unchanged. Few-shot influences draft
  quality, never autonomy or publishing.
- **No live quality lift is claimed yet.** The mechanism is proven on a seeded corpus (the
  phase-blocking harness); real, measurable improvement depends on the tenant building up correction
  volume. Trusted-operator review is the implicit signal-quality control for now.
