import { describe, expect, it } from "vitest";

import { DraftNotApproved, ScopeAlreadyPublished } from "@/server/agents/scope-generator/errors";

describe("DraftNotApproved", () => {
  it("sets exact message and name for a representative draftId", () => {
    const draftId = "draft_123";
    const err = new DraftNotApproved(draftId);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      `DRAFT_NOT_APPROVED: scope draft ${draftId} is not in 'approved' status`,
    );
  });

  it("handles boundary draftId (empty string) with the exact message", () => {
    const err = new DraftNotApproved("");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      `DRAFT_NOT_APPROVED: scope draft  is not in 'approved' status`,
    );
  });
});

describe("ScopeAlreadyPublished", () => {
  it("sets exact message and name for a representative jobId", () => {
    const jobId = "job_456";
    const err = new ScopeAlreadyPublished(jobId);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ScopeAlreadyPublished);
    expect(err.name).toBe("ScopeAlreadyPublished");
    expect(err.message).toBe(`SCOPE_ALREADY_PUBLISHED: job ${jobId} already has a published scope`);
  });

  it("handles boundary jobId (empty string) with the exact message", () => {
    const err = new ScopeAlreadyPublished("");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ScopeAlreadyPublished);
    expect(err.name).toBe("ScopeAlreadyPublished");
    expect(err.message).toBe(
      "SCOPE_ALREADY_PUBLISHED: job  already has a published scope",
    );
  });
});
