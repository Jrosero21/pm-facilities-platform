import { describe, expect, it } from "vitest";

import {
  evaluatePolicyConditions,
  parseConditions,
  type PolicyActionContext,
} from "@/server/agents/config/conditions";

describe("parseConditions", () => {
  it("returns a parsed ConditionsBlock when raw contains a valid conditions object", () => {
    const raw = {
      conditions: {
        maxNteAmount: 500,
        allowedTradeCodes: ["T1", "T2"],
        blockedTradeCodes: ["T_BLOCK"],
        allowedPriorityCodes: ["P1"],
        blockedPriorityCodes: ["P_BLOCK"],
        allowedClientIds: ["C1"],
        blockedClientIds: ["C_BLOCK"],
      },
    };

    const parsed = parseConditions(raw);
    expect(parsed).not.toBe("invalid");
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      maxNteAmount: 500,
      allowedTradeCodes: ["T1", "T2"],
      blockedTradeCodes: ["T_BLOCK"],
      allowedPriorityCodes: ["P1"],
      blockedPriorityCodes: ["P_BLOCK"],
      allowedClientIds: ["C1"],
      blockedClientIds: ["C_BLOCK"],
    });
  });

  it('returns null when the conditions key is absent', () => {
    const raw = { policyName: "x" };
    expect(parseConditions(raw)).toBeNull();
  });

  it('returns null when the conditions key is explicitly null', () => {
    const raw = { conditions: null };
    expect(parseConditions(raw)).toBeNull();
  });

  it('returns "invalid" when the conditions object fails schema validation', () => {
    // maxNteAmount must be a number; string should fail.
    const raw = {
      conditions: {
        maxNteAmount: "500",
      },
    };

    expect(parseConditions(raw)).toBe("invalid");
  });

  it("returns null when raw itself is null/undefined (conditions key reading safely) ", () => {
    expect(parseConditions(null)).toBeNull();
    expect(parseConditions(undefined)).toBeNull();
  });
});

describe("evaluatePolicyConditions", () => {
  const baseCtx: PolicyActionContext = {
    effectiveNte: 450,
    tradeCode: "T1",
    priorityCode: "P1",
    clientId: "C1",
  };

  it("returns pass=true when parsed conditions are null (absent block)", () => {
    const res = evaluatePolicyConditions(null, baseCtx);
    expect(res).toEqual({ pass: true, failedOn: null });
  });

  it('returns pass=false and failedOn="nte_over_threshold" when maxNteAmount is set and effectiveNte is too high', () => {
    const res = evaluatePolicyConditions(
      {
        maxNteAmount: 400,
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "nte_over_threshold" });
  });

  it('returns pass=false and failedOn="nte_unknown" when maxNteAmount is set but effectiveNte is null', () => {
    const ctx: PolicyActionContext = { ...baseCtx, effectiveNte: null };
    const res = evaluatePolicyConditions(
      {
        maxNteAmount: 400,
      },
      ctx,
    );
    expect(res).toEqual({ pass: false, failedOn: "nte_unknown" });
  });

  it('returns pass=false and failedOn="trade_not_allowed" when allowedTradeCodes does not include ctx.tradeCode', () => {
    const res = evaluatePolicyConditions(
      {
        allowedTradeCodes: ["OTHER"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "trade_not_allowed" });
  });

  it("trade_not_allowed happens when allowedTradeCodes is set but ctx.tradeCode is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, tradeCode: null };
    const res = evaluatePolicyConditions(
      {
        allowedTradeCodes: ["T1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: false, failedOn: "trade_not_allowed" });
  });

  it('returns pass=false and failedOn="trade_blocked" when blockedTradeCodes contains ctx.tradeCode', () => {
    const res = evaluatePolicyConditions(
      {
        blockedTradeCodes: ["T1"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "trade_blocked" });
  });

  it("trade_blocked does NOT fail when blockedTradeCodes is set but ctx.tradeCode is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, tradeCode: null };
    const res = evaluatePolicyConditions(
      {
        blockedTradeCodes: ["T1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: true, failedOn: null });
  });

  it('returns pass=false and failedOn="priority_not_allowed" when allowedPriorityCodes does not include ctx.priorityCode', () => {
    const res = evaluatePolicyConditions(
      {
        allowedPriorityCodes: ["P_OTHER"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "priority_not_allowed" });
  });

  it("priority_not_allowed fails when allowedPriorityCodes is set but ctx.priorityCode is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, priorityCode: null };
    const res = evaluatePolicyConditions(
      {
        allowedPriorityCodes: ["P1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: false, failedOn: "priority_not_allowed" });
  });

  it('returns pass=false and failedOn="priority_blocked" when blockedPriorityCodes contains ctx.priorityCode', () => {
    const res = evaluatePolicyConditions(
      {
        blockedPriorityCodes: ["P1"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "priority_blocked" });
  });

  it("priority_blocked does NOT fail when blockedPriorityCodes is set but ctx.priorityCode is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, priorityCode: null };
    const res = evaluatePolicyConditions(
      {
        blockedPriorityCodes: ["P1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: true, failedOn: null });
  });

  it('returns pass=false and failedOn="client_not_allowed" when allowedClientIds does not include ctx.clientId', () => {
    const res = evaluatePolicyConditions(
      {
        allowedClientIds: ["C_OTHER"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "client_not_allowed" });
  });

  it("client_not_allowed fails when allowedClientIds is set but ctx.clientId is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, clientId: null };
    const res = evaluatePolicyConditions(
      {
        allowedClientIds: ["C1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: false, failedOn: "client_not_allowed" });
  });

  it('returns pass=false and failedOn="client_blocked" when blockedClientIds contains ctx.clientId', () => {
    const res = evaluatePolicyConditions(
      {
        blockedClientIds: ["C1"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: false, failedOn: "client_blocked" });
  });

  it("client_blocked does NOT fail when blockedClientIds is set but ctx.clientId is null", () => {
    const ctx: PolicyActionContext = { ...baseCtx, clientId: null };
    const res = evaluatePolicyConditions(
      {
        blockedClientIds: ["C1"],
      },
      ctx,
    );
    expect(res).toEqual({ pass: true, failedOn: null });
  });

  it('returns pass=false and failedOn="invalid_conditions" when parsed conditions is "invalid"', () => {
    const res = evaluatePolicyConditions("invalid", baseCtx);
    expect(res).toEqual({ pass: false, failedOn: "invalid_conditions" });
  });

  it("returns pass=true when all provided condition filters match", () => {
    const res = evaluatePolicyConditions(
      {
        maxNteAmount: 500, // boundary is <=, baseCtx effectiveNte=450 should pass
        allowedTradeCodes: ["T1"],
        blockedTradeCodes: ["T_OTHER"],
        allowedPriorityCodes: ["P1"],
        blockedPriorityCodes: ["P_OTHER"],
        allowedClientIds: ["C1"],
        blockedClientIds: ["C_OTHER"],
      },
      baseCtx,
    );
    expect(res).toEqual({ pass: true, failedOn: null });
  });
});
