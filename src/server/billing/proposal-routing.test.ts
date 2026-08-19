import { describe, expect, it } from "vitest";

import { decideProposalKind } from "./proposal-routing";

describe("decideProposalKind", () => {
  it("returns client when forceClientReview is true (override)", () => {
    expect(decideProposalKind("0", "0", true)).toBe("client");
    expect(decideProposalKind("999", "1", true)).toBe("client");
  });

  it("returns client when effectiveNte is null (fail-safe)", () => {
    expect(decideProposalKind("0", null, false)).toBe("client");
    expect(decideProposalKind("999", null, false)).toBe("client");
  });

  it("returns internal when total is exactly on the NTE boundary (lte)", () => {
    expect(decideProposalKind("100.00", "100", false)).toBe("internal");
    expect(decideProposalKind("0", "0.000", false)).toBe("internal");
  });

  it("returns internal when total is below the NTE", () => {
    expect(decideProposalKind("99.99", "100", false)).toBe("internal");
    expect(decideProposalKind("-1", "0", false)).toBe("internal");
  });

  it("returns client when total is above the NTE", () => {
    expect(decideProposalKind("100.01", "100", false)).toBe("client");
    expect(decideProposalKind("1", "0", false)).toBe("client");
  });
});
