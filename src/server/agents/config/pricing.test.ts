import { describe, expect, it } from "vitest";

import { priceFor, type ModelPrice } from "./pricing";

describe("priceFor", () => {
  it("returns the exact pinned price for known Anthropic model", () => {
    const result = priceFor("anthropic/claude-sonnet-4-6");

    const expected: ModelPrice = {
      inputPerToken: "0.000003",
      outputPerToken: "0.000015",
    };

    expect(result).toEqual(expected);
  });

  it("returns the exact pinned price for known OpenAI model", () => {
    const result = priceFor("openai/gpt-5.4");

    const expected: ModelPrice = {
      inputPerToken: "0.0000025",
      outputPerToken: "0.000015",
    };

    expect(result).toEqual(expected);
  });

  it("returns null for an unknown (unmeasurable) model string", () => {
    expect(priceFor("anthropic/unknown-model")).toBeNull();
  });

  it("returns null when model is null", () => {
    expect(priceFor(null)).toBeNull();
  });

  it("returns null when model is an empty string", () => {
    expect(priceFor("")).toBeNull();
  });
});
