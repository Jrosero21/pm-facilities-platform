import { describe, expect, it } from "vitest";

import {
  isDeterministicAgent,
  tierForAgent,
  type QualityTier,
} from "@/server/agents/quality/tiers";

describe("tierForAgent", () => {
  it("returns exact tier for every known agent id", () => {
    const cases: Array<[string, QualityTier | null]> = [
      ["update_rewriter_v1", "tier1"],
      ["intake_parser_v1", "tier1"],
      ["vendor_followup_v1", "tier1"],
      ["scope_generator_v1", "tier3"],
      ["invoice_creator_v1", "tier3"],
      ["proposal_generator_v1", "tier3"],
      // Deterministic agent has no tier mapping.
      ["dispatch_router_v1", null],
    ];

    for (const [agentId, expected] of cases) {
      expect(tierForAgent(agentId)).toBe(expected);
    }
  });

  it("returns null for empty string and for unknown agent ids", () => {
    expect(tierForAgent("")).toBe(null);
    expect(tierForAgent("unknown_agent_id")).toBe(null);
  });

  it("is case-sensitive (unknown casing returns null)", () => {
    expect(tierForAgent("Update_rewriter_v1")).toBe(null);
  });

  it("returns null for null/undefined cast at runtime", () => {
    expect(tierForAgent(null as unknown as string)).toBe(null);
    expect(tierForAgent(undefined as unknown as string)).toBe(null);
  });
});

describe("isDeterministicAgent", () => {
  it("returns true only for known deterministic agent ids", () => {
    const cases: Array<[string, boolean]> = [
      ["dispatch_router_v1", true],
      // All other tier-mapped agents are not deterministic.
      ["update_rewriter_v1", false],
      ["intake_parser_v1", false],
      ["vendor_followup_v1", false],
      ["scope_generator_v1", false],
      ["invoice_creator_v1", false],
      ["proposal_generator_v1", false],
    ];

    for (const [agentId, expected] of cases) {
      expect(isDeterministicAgent(agentId)).toBe(expected);
    }
  });

  it("returns false for empty string and for unknown agent ids", () => {
    expect(isDeterministicAgent("")).toBe(false);
    expect(isDeterministicAgent("unknown_agent_id")).toBe(false);
  });

  it("is case-sensitive (unknown casing returns false)", () => {
    expect(isDeterministicAgent("Dispatch_Router_V1")).toBe(false);
  });

  it("returns false for null/undefined cast at runtime", () => {
    expect(isDeterministicAgent(null as unknown as string)).toBe(false);
    expect(isDeterministicAgent(undefined as unknown as string)).toBe(false);
  });
});
