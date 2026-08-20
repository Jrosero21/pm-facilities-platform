import { describe, expect, it } from "vitest";
import { buildInvoiceNotification } from "@/server/billing/invoice-notify-content";

// The pure half of G1 batch 2. buildInvoiceNotification has no DB and no I/O, so the whole
// content contract is assertable here — the @react-pdf constraint that keeps the RENDER out of
// this harness does not touch the builder.
//
// ★ SUBJECT AND BODY LINES ARE ASSERTED AS PLAIN STRING LITERALS, never rebuilt with the same
// template expression the module uses — a test that interpolates the subject the same way the code
// does would pass through any wording change, which is precisely what it should catch.

const BASE = {
  invoiceLabel: "INV-000019",
  jobNumber: 42,
  clientName: "Acme Retail Co",
  locationName: "SF Downtown Store",
  total: "521.50",
  currency: "USD",
  dueAt: null,
  paymentTermsDays: null,
  fromName: "Rose Analytics and Development",
};

describe("buildInvoiceNotification", () => {
  it("names the invoice, the work order and the sender in the subject", () => {
    const { subject } = buildInvoiceNotification(BASE);
    expect(subject).toBe(
      "Invoice INV-000019 for work order #42 from Rose Analytics and Development",
    );
  });

  it("omits the work-order clause when there is no job number", () => {
    const { subject } = buildInvoiceNotification({ ...BASE, jobNumber: null });
    expect(subject).toBe("Invoice INV-000019 from Rose Analytics and Development");
  });

  it("states the total as the amount due, formatted, with the currency", () => {
    const { body } = buildInvoiceNotification(BASE);
    expect(body).toContain("Amount due: $521.50 USD");
  });

  it("prefers an explicit due date over payment terms", () => {
    const { body } = buildInvoiceNotification({
      ...BASE,
      dueAt: new Date("2026-09-18T00:00:00Z"),
      paymentTermsDays: 30,
    });
    expect(body).toContain("Due: ");
    expect(body).not.toContain("Payment terms:");
  });

  it("falls back to payment terms when no due date is set", () => {
    const { body } = buildInvoiceNotification({ ...BASE, paymentTermsDays: 30 });
    expect(body).toContain("Payment terms: net 30 days");
    expect(body).not.toContain("Due: ");
  });

  it("states neither when the invoice carries no due date and no terms", () => {
    const { body } = buildInvoiceNotification(BASE);
    expect(body).not.toContain("Payment terms:");
    expect(body).not.toContain("Due: ");
  });

  it("drops client and location lines when they are absent", () => {
    const { body } = buildInvoiceNotification({
      ...BASE,
      clientName: null,
      locationName: null,
    });
    expect(body).not.toContain("Client:");
    expect(body).not.toContain("Location:");
    expect(body).toContain("Invoice: INV-000019");
  });

  it("tells the reader the PDF is attached — the email is not self-sufficient", () => {
    const { body } = buildInvoiceNotification(BASE);
    expect(body).toContain("The full invoice is attached as a PDF.");
  });

  it("signs off as the tenant, not the client", () => {
    const { body } = buildInvoiceNotification(BASE);
    expect(body.trimEnd().endsWith("Rose Analytics and Development")).toBe(true);
    expect(body).not.toContain("Thank you,\nAcme Retail Co");
  });

  // ★ OQ-6 / margin safety. The builder takes no subtotal, no markup and no vendor cost, so it
  // CANNOT leak one — this pins that as a property rather than a hope. The only money permitted
  // in the body is the total the client is being asked to pay.
  it("states exactly one money figure and never a margin word", () => {
    const { subject, body } = buildInvoiceNotification({
      ...BASE,
      dueAt: null,
      paymentTermsDays: 30,
    });
    const whole = `${subject}\n${body}`;
    expect(whole.match(/\$[\d,]+\.\d{2}/g)).toEqual(["$521.50"]);
    for (const word of ["markup", "margin", "subtotal", "cost", "vendor"]) {
      expect(whole.toLowerCase()).not.toContain(word);
    }
  });

  it("is deterministic — same input, identical output", () => {
    expect(buildInvoiceNotification(BASE)).toEqual(buildInvoiceNotification(BASE));
  });
});
