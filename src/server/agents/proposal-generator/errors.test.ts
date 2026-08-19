import { describe, expect, it } from "vitest";

import {
  DraftNotApproved,
  ProposalAlreadyMaterialized,
  ProposalRequiresPricing,
} from "./errors";

describe("DraftNotApproved", () => {
  it("sets exact message/name and is an Error subclass for a representative draft id", () => {
    const err = new DraftNotApproved("draft_123");

    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      "DRAFT_NOT_APPROVED: proposal draft draft_123 is not in 'approved' status"
    );
  });

  it("handles empty string draft id (pins the exact message)", () => {
    const err = new DraftNotApproved("");

    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      "DRAFT_NOT_APPROVED: proposal draft  is not in 'approved' status"
    );
  });
});

describe("ProposalAlreadyMaterialized", () => {
  it("sets exact message/name and is an Error subclass for a representative draft id", () => {
    const err = new ProposalAlreadyMaterialized("draft_456");

    expect(err).toBeInstanceOf(ProposalAlreadyMaterialized);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProposalAlreadyMaterialized");
    expect(err.message).toBe(
      "PROPOSAL_ALREADY_MATERIALIZED: proposal draft draft_456 already has a published proposal"
    );
  });

  it("handles empty string draft id (pins the exact message)", () => {
    const err = new ProposalAlreadyMaterialized("");

    expect(err).toBeInstanceOf(ProposalAlreadyMaterialized);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProposalAlreadyMaterialized");
    expect(err.message).toBe(
      "PROPOSAL_ALREADY_MATERIALIZED: proposal draft  already has a published proposal"
    );
  });
});

describe("ProposalRequiresPricing", () => {
  it("sets exact message/name and is an Error subclass for a representative draft id", () => {
    const err = new ProposalRequiresPricing("draft_789");

    expect(err).toBeInstanceOf(ProposalRequiresPricing);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProposalRequiresPricing");
    expect(err.message).toBe(
      "PROPOSAL_REQUIRES_PRICING: proposal draft draft_789 has unpriced/ malformed line(s); operator must price it at the gate"
    );
  });

  it("handles empty string draft id (pins the exact message)", () => {
    const err = new ProposalRequiresPricing("");

    expect(err).toBeInstanceOf(ProposalRequiresPricing);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProposalRequiresPricing");
    expect(err.message).toBe(
      "PROPOSAL_REQUIRES_PRICING: proposal draft  has unpriced/ malformed line(s); operator must price it at the gate"
    );
  });
});
