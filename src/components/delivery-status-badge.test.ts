import { describe, expect, it } from "vitest";
import {
  communicationBadgeMeta,
  deliveryStatusLabel,
  isLegalDeliveryTransition,
  legalDeliveryTransitions,
} from "@/components/delivery-status-badge";

// G2 polish. The badge is the ONE place a phone_call row is special-cased, so these tests carry
// the whole contract: calls read as calls, and every other channel is untouched.

describe("communicationBadgeMeta — phone_call", () => {
  it("labels an outbound call as a call, not a delivery", () => {
    expect(communicationBadgeMeta("delivered", "phone_call", "outbound").label).toBe(
      "Outbound call",
    );
  });

  it("labels an inbound call as a call, not a receipt", () => {
    expect(communicationBadgeMeta("received", "phone_call", "inbound").label).toBe("Inbound call");
  });

  // The point of the change: the transmission words must not appear on a logged call.
  it("never renders a transmission word for a phone_call row", () => {
    for (const [status, direction] of [
      ["delivered", "outbound"],
      ["received", "inbound"],
    ] as const) {
      const { label } = communicationBadgeMeta(status, "phone_call", direction);
      expect(label).not.toBe("Delivered");
      expect(label).not.toBe("Received");
      expect(label).not.toBe("Sent");
    }
  });

  // The label is driven by direction, NOT by delivery_status — so the data staying terminal
  // (which is what keeps sendCommunication away from it) cannot leak back into the wording.
  it("ignores the stored status entirely", () => {
    expect(communicationBadgeMeta("sent", "phone_call", "outbound").label).toBe("Outbound call");
    expect(communicationBadgeMeta("anything", "phone_call", "inbound").label).toBe("Inbound call");
  });

  it("falls back to outbound when direction is absent", () => {
    expect(communicationBadgeMeta("delivered", "phone_call").label).toBe("Outbound call");
  });
});

describe("communicationBadgeMeta — every other channel is unchanged", () => {
  const CHANNELS = ["email", "sms", "client_portal", "vendor_portal", "internal_note"];

  it("renders the delivery-status label for non-call channels", () => {
    for (const channel of CHANNELS) {
      expect(communicationBadgeMeta("delivered", channel, "outbound").label).toBe("Delivered");
      expect(communicationBadgeMeta("sent", channel, "outbound").label).toBe("Sent");
      expect(communicationBadgeMeta("failed", channel, "outbound").label).toBe("Failed");
    }
  });

  // The pre-G2 call shape (status only, no channel) must behave exactly as it did.
  it("is identical to the old status-only behaviour when no channel is passed", () => {
    for (const s of ["draft", "queued", "sent", "delivered", "failed", "bounced", "received"]) {
      expect(communicationBadgeMeta(s).label).toBe(deliveryStatusLabel(s));
    }
  });

  it("keeps the draft fallback for an unknown status", () => {
    expect(communicationBadgeMeta("wat", "email", "outbound").label).toBe("Draft");
  });
});

// Guardrail for the data half of G2: the two statuses logContact writes must stay TERMINAL. If a
// transition is ever added out of them, sendCommunication could pick up a logged call and transmit
// a conversation that already happened.
describe("logged-call statuses remain terminal", () => {
  it("delivered and received have no onward transitions", () => {
    expect(legalDeliveryTransitions("delivered")).toEqual([]);
    expect(legalDeliveryTransitions("received")).toEqual([]);
  });

  it("cannot be sent", () => {
    expect(isLegalDeliveryTransition("delivered", "sent")).toBe(false);
    expect(isLegalDeliveryTransition("received", "sent")).toBe(false);
  });
});
