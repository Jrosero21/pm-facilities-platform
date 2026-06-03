// ── Agent registry (Phase 6 6g.a) ────────────────────────────────────────────────────
// The enumeration seam for Phase 16's chatbot ("which agents are available?"). One entry
// per agent identity (versioned agent_id, {name}_v{major}). Pure metadata — implementations
// live in src/server/agents/<name>/. NO "server-only" so it can be read from anywhere
// (it holds no DB access).
//
// REFINEMENT (flag for review): `testOnly` distinguishes the committed test stub from
// production agents. test_stub_v1 IS registered (per the build spec) so the substrate has
// a reference agent, but Phase 16's tenant-facing enumeration MUST filter `testOnly` out —
// a test fixture must never surface as an "available agent" to operators.

export type AgentRegistryEntry = {
  id: string;
  name: string;
  description: string;
  inputSourceTypes: string[]; // polymorphic source_type values this agent reads (LOCK 1)
  outputType: string;
  testOnly: boolean;
};

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  update_rewriter_v1: {
    id: "update_rewriter_v1",
    name: "Update Rewriter",
    description:
      "Rewrites internal job notes into client-safe update drafts — strips pricing, PII, and vendor-only context. Operator reviews before client-portal publish (§2.9).",
    inputSourceTypes: ["job_note"], // Phase 10+ extends to "vendor_update"
    outputType: "update_rewrite_draft",
    testOnly: false,
  },
  scope_generator_v1: {
    id: "scope_generator_v1",
    name: "Scope Generator",
    description:
      "Generates a structured, reviewable technician scope of work from a job's problem description. Operator reviews and edits before the scope is published to the job (§2.9).",
    inputSourceTypes: ["job"], // reads current-job context only (OQ #6)
    outputType: "job_scope_draft",
    testOnly: false,
  },
  invoice_creator_v1: {
    id: "invoice_creator_v1",
    name: "Invoice Creator",
    description:
      "Drafts a reviewable, marked-up client invoice from a submitted vendor invoice on a completed job (§2.9). LLM writes line-item phrasing only; all amounts derive from the vendor invoice and markup rules.",
    inputSourceTypes: ["job", "vendor_invoice"], // reads the job context + the source AP invoice
    outputType: "invoice_draft",
    testOnly: false,
  },
  chatbot_assistant_v1: {
    id: "chatbot_assistant_v1",
    name: "Operations Assistant",
    description:
      "Read/draft operations assistant — answers questions over platform knowledge docs and tenant-scoped readers, and produces pending-review drafts (never sends). Tools are added in later Phase-16 slices; this slice registers the identity + the shared-runner wiring only.",
    inputSourceTypes: ["job", "job_note", "vendor_update"], // the sources its (future) read/draft tools operate over
    outputType: "assistant_response",
    testOnly: false,
  },
  dispatch_router_v1: {
    id: "dispatch_router_v1",
    name: "Dispatch Router",
    description:
      "Rule-based Tier-2 vendor auto-dispatch (Phase 22 mechanism, Phase 23 governed). Picks the top floor-filtered, preference-then-rank candidate and drafts a dispatch; governed by agent_policies + the tenant autonomy kill-switch. No LLM, no prompt template.",
    inputSourceTypes: ["job"],
    outputType: "dispatch_draft",
    testOnly: false,
  },
  test_stub_v1: {
    id: "test_stub_v1",
    name: "Test Stub Agent",
    description:
      "Deterministic, LLM-free agent that exercises the full substrate (run + tool calls + decision + draft) for substrate-correctness testing. Committed test infrastructure — excluded from tenant-facing enumeration.",
    inputSourceTypes: ["job_note"],
    outputType: "update_rewrite_draft",
    testOnly: true,
  },
};

/** Production agents available to operators (test fixtures filtered out) — Phase 16 seam. */
export function listProductionAgents(): AgentRegistryEntry[] {
  return Object.values(AGENT_REGISTRY).filter((a) => !a.testOnly);
}
