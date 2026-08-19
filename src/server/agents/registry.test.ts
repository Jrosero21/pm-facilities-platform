import { describe, expect, it } from "vitest";

import { AGENT_REGISTRY, listProductionAgents } from "@/server/agents/registry";

describe("src/server/agents/registry", () => {
  it("exports AGENT_REGISTRY with an exact production-manifest object (keys + values)", () => {
    // Pin the exact manifest today: keys and each production marker field value.
    const actualKeys = Object.keys(AGENT_REGISTRY);
    expect(actualKeys).toEqual([
      "update_rewriter_v1",
      "scope_generator_v1",
      "intake_parser_v1",
      "vendor_followup_v1",
      "invoice_creator_v1",
      "proposal_generator_v1",
      "chatbot_assistant_v1",
      "dispatch_router_v1",
      "dispatch_tiebreaker_v1",
      "test_stub_v1",
    ]);

    // Pin every entry’s full production marker fields.
    expect(AGENT_REGISTRY["update_rewriter_v1"]).toEqual({
      id: "update_rewriter_v1",
      name: "Update Rewriter",
      description:
        "Rewrites internal job notes into client-safe update drafts — strips pricing, PII, and vendor-only context. Operator reviews before client-portal publish (§2.9).",
      inputSourceTypes: ["job_note"],
      outputType: "update_rewrite_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["scope_generator_v1"]).toEqual({
      id: "scope_generator_v1",
      name: "Scope Generator",
      description:
        "Generates a structured, reviewable technician scope of work from a job's problem description. Operator reviews and edits before the scope is published to the job (§2.9).",
      inputSourceTypes: ["job"],
      outputType: "job_scope_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["intake_parser_v1"]).toEqual({
      id: "intake_parser_v1",
      name: "Intake Parser",
      description:
        "Extracts a structured, reviewable work-order draft from an inbound email (problem + client/trade/priority codes), resolving codes via the existing external mappers. Writes a partial email_work_order_draft @ pending_review; the operator reviews before a job is created (§2.9, record-don't-apply).",
      inputSourceTypes: ["email_ingestion", "forwarded_email"],
      outputType: "email_work_order_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["vendor_followup_v1"]).toEqual({
      id: "vendor_followup_v1",
      name: "Vendor Follow-up",
      description:
        "Drafts a polite chase message to a vendor that has gone quiet on a SENT dispatch (confirmed via isDispatchStuck). The soft rung-0 before redispatch: writes a vendor_followup_draft @ pending_review for operator review; never sends and never replaces the vendor (§2.9, record-don't-apply).",
      inputSourceTypes: ["dispatch_assignment"],
      outputType: "vendor_followup_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["invoice_creator_v1"]).toEqual({
      id: "invoice_creator_v1",
      name: "Invoice Creator",
      description:
        "Drafts a reviewable, marked-up client invoice from a submitted vendor invoice on a completed job (§2.9). LLM writes line-item phrasing only; all amounts derive from the vendor invoice and markup rules.",
      inputSourceTypes: ["job", "vendor_invoice"],
      outputType: "invoice_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["proposal_generator_v1"]).toEqual({
      id: "proposal_generator_v1",
      name: "Proposal Generator",
      description:
        "Drafts a reviewable, number-free internal proposal (line-item phrasing + scope language) from a job's context (§2.9). The operator authors the dollar figures at the review gate; on publish the NTE send-gate decides client- vs internal-kind. The LLM never emits an amount.",
      inputSourceTypes: ["job"],
      outputType: "proposal_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["chatbot_assistant_v1"]).toEqual({
      id: "chatbot_assistant_v1",
      name: "Operations Assistant",
      description:
        "Read/draft operations assistant — answers questions over platform knowledge docs and tenant-scoped readers, and produces pending-review drafts (never sends). Tools are added in later Phase-16 slices; this slice registers the identity + the shared-runner wiring only.",
      inputSourceTypes: ["job", "job_note", "vendor_update"],
      outputType: "assistant_response",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["dispatch_router_v1"]).toEqual({
      id: "dispatch_router_v1",
      name: "Dispatch Router",
      description:
        "Rule-based Tier-2 vendor auto-dispatch (Phase 22 mechanism, Phase 23 governed). Picks the top floor-filtered, preference-then-rank candidate and drafts a dispatch; governed by agent_policies + the tenant autonomy kill-switch. No LLM, no prompt template.",
      inputSourceTypes: ["job"],
      outputType: "dispatch_draft",
      testOnly: false,
    });

    expect(AGENT_REGISTRY["dispatch_tiebreaker_v1"]).toEqual({
      id: "dispatch_tiebreaker_v1",
      name: "Dispatch Tiebreaker",
      description:
        "LLM semantic-fit tiebreaker for AI-assisted dispatch. Fires ONLY on a deterministic close call between two near-equal eligible vendors; picks the better specialization fit within that pair, never beyond it. Number-free. Degrades to the deterministic ranking when unavailable, over token budget, or low-confidence. Per-tenant firing mode (autonomy_only default).",
      inputSourceTypes: ["job"],
      outputType: "dispatch_tiebreak",
      testOnly: false,
    });

    // Pin the non-production entry too (so refactors cannot accidentally flip it).
    expect(AGENT_REGISTRY["test_stub_v1"]).toEqual({
      id: "test_stub_v1",
      name: "Test Stub Agent",
      description:
        "Deterministic, LLM-free agent that exercises the full substrate (run + tool calls + decision + draft) for substrate-correctness testing. Committed test infrastructure — excluded from tenant-facing enumeration.",
      inputSourceTypes: ["job_note"],
      outputType: "update_rewrite_draft",
      testOnly: true,
    });
  });

  it("listProductionAgents filters out non-production agents and preserves insertion order", () => {
    const entries = listProductionAgents();

    // Defined order today: Object.values over an object literal preserves insertion order.
    const idsInOrder = entries.map((e) => e.id);
    expect(idsInOrder).toEqual([
      "update_rewriter_v1",
      "scope_generator_v1",
      "intake_parser_v1",
      "vendor_followup_v1",
      "invoice_creator_v1",
      "proposal_generator_v1",
      "chatbot_assistant_v1",
      "dispatch_router_v1",
      "dispatch_tiebreaker_v1",
    ]);

    // Exclude every non-production entry by name/id.
    const excludedIds = entries
      .map((e) => e.id)
      .filter((id) => id === "test_stub_v1");
    expect(excludedIds).toEqual([]);

    // Also pin the exact count today (manifest seam).
    expect(entries).toHaveLength(9);

    // Edge check: verify all returned entries are marked testOnly=false.
    for (const entry of entries) {
      expect(entry.testOnly).toBe(false);
    }
  });
});
