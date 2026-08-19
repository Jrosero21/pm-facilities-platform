import { describe, expect, it } from "vitest";

import {
  ActivationTargetMismatch,
  NoActivePromptError,
  SingleActiveInvariantViolated,
} from "./errors";

describe("NoActivePromptError", () => {
  it("constructs with agentId+variant and sets exact message and name", () => {
    const err = new NoActivePromptError("agent-123", "billing");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NoActivePromptError);
    expect(err.name).toBe("NoActivePromptError");
    expect(err.message).toBe(
      "NO_ACTIVE_PROMPT: no active prompt for agent_id=agent-123 variant=billing",
    );
  });

  it("handles empty-string edge inputs (still preserves exact message contract)", () => {
    const err = new NoActivePromptError("", "");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NoActivePromptError);
    expect(err.name).toBe("NoActivePromptError");
    expect(err.message).toBe(
      "NO_ACTIVE_PROMPT: no active prompt for agent_id= variant=",
    );
  });
});

describe("SingleActiveInvariantViolated", () => {
  it("constructs with table+key+foundActive and sets exact message and name", () => {
    const err = new SingleActiveInvariantViolated("agent_configs", "resolver_key_1", 3);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SingleActiveInvariantViolated);
    expect(err.name).toBe("SingleActiveInvariantViolated");
    expect(err.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: agent_configs had 3 active rows for resolver_key_1 before activation (expected <= 1)",
    );
  });

  it("covers numeric boundary sides: foundActive=1 (expected <= 1 satisfied per message)", () => {
    const err = new SingleActiveInvariantViolated("t", "k", 1);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SingleActiveInvariantViolated);
    expect(err.name).toBe("SingleActiveInvariantViolated");
    expect(err.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: t had 1 active rows for k before activation (expected <= 1)",
    );
  });

  it("covers numeric boundary sides: foundActive=2 (expected <= 1 violated per message)", () => {
    const err = new SingleActiveInvariantViolated("t", "k", 2);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SingleActiveInvariantViolated);
    expect(err.name).toBe("SingleActiveInvariantViolated");
    expect(err.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED: t had 2 active rows for k before activation (expected <= 1)",
    );
  });

  it("handles empty-string edge inputs for table/key", () => {
    const err = new SingleActiveInvariantViolated("", "", 0);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SingleActiveInvariantViolated);
    expect(err.name).toBe("SingleActiveInvariantViolated");
    expect(err.message).toBe(
      "SINGLE_ACTIVE_INVARIANT_VIOLATED:  had 0 active rows for  before activation (expected <= 1)",
    );
  });
});

describe("ActivationTargetMismatch", () => {
  it("constructs with table+id and sets exact message and name", () => {
    const err = new ActivationTargetMismatch("agent_configs", "row-999");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ActivationTargetMismatch);
    expect(err.name).toBe("ActivationTargetMismatch");
    expect(err.message).toBe(
      "ACTIVATION_TARGET_MISMATCH: agent_configs row id=row-999 missing or key mismatch (promote affected != 1)",
    );
  });

  it("covers empty-string edge inputs (still preserves exact message contract)", () => {
    const err = new ActivationTargetMismatch("", "");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ActivationTargetMismatch);
    expect(err.name).toBe("ActivationTargetMismatch");
    expect(err.message).toBe(
      "ACTIVATION_TARGET_MISMATCH:  row id= missing or key mismatch (promote affected != 1)",
    );
  });
});
