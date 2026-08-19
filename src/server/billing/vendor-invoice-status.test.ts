import { describe, expect, it } from "vitest";

import { canDraftClientInvoice } from "./vendor-invoice-status";

describe("canDraftClientInvoice", () => {
  it("returns true for representative allowed statuses", () => {
    expect(canDraftClientInvoice("received")).toBe(true);
    expect(canDraftClientInvoice("under_review")).toBe(true);
    expect(canDraftClientInvoice("approved")).toBe(true);
  });

  it("returns false for deliberately excluded statuses (including comment-named ones)", () => {
    // The comment says: "NOT a disputed/paid one."
    expect(canDraftClientInvoice("disputed")).toBe(false);
    expect(canDraftClientInvoice("paid")).toBe(false);

    // Also pin some other unrecognized values.
    expect(canDraftClientInvoice("draft")).toBe(false);
    expect(canDraftClientInvoice("closed")).toBe(false);
  });

  it("returns false for empty string and unrecognized status", () => {
    expect(canDraftClientInvoice("")).toBe(false);
    expect(canDraftClientInvoice("not_a_real_status")).toBe(false);
  });

  it("is case-sensitive (different casing does not match)", () => {
    expect(canDraftClientInvoice("Received")).toBe(false);
    expect(canDraftClientInvoice("Under_Review")).toBe(false);
    expect(canDraftClientInvoice("APPROVED")).toBe(false);
  });
});
