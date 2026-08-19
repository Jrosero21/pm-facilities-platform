import { describe, expect, it } from "vitest";

import {
  DraftNotApproved,
  InvoiceAlreadyMaterialized,
} from "@/server/agents/invoice-creator/errors";

describe("DraftNotApproved", () => {
  it("constructs with a real draftId and sets message + name", () => {
    const err = new DraftNotApproved("draft_123");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      "DRAFT_NOT_APPROVED: invoice draft draft_123 is not in 'approved' status",
    );
  });

  it("constructs with empty draftId (edge case) and preserves the message template", () => {
    const err = new DraftNotApproved("");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DraftNotApproved);
    expect(err.name).toBe("DraftNotApproved");
    expect(err.message).toBe(
      "DRAFT_NOT_APPROVED: invoice draft  is not in 'approved' status",
    );
  });
});

describe("InvoiceAlreadyMaterialized", () => {
  it("constructs with a real draftId and sets message + name", () => {
    const err = new InvoiceAlreadyMaterialized("draft_abc");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvoiceAlreadyMaterialized);
    expect(err.name).toBe("InvoiceAlreadyMaterialized");
    expect(err.message).toBe(
      "INVOICE_ALREADY_MATERIALIZED: invoice draft draft_abc already has a published client invoice",
    );
  });

  it("constructs with empty draftId (edge case) and preserves the message template", () => {
    const err = new InvoiceAlreadyMaterialized("");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvoiceAlreadyMaterialized);
    expect(err.name).toBe("InvoiceAlreadyMaterialized");
    expect(err.message).toBe(
      "INVOICE_ALREADY_MATERIALIZED: invoice draft  already has a published client invoice",
    );
  });
});
