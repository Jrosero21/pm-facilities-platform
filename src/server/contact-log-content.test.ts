import { describe, expect, it } from "vitest";
import {
  CONTACT_LOG_CHANNEL,
  CONTACT_LOG_VISIBILITY,
  CONTACT_NOTES_MAX,
  contactLogDeliveryStatus,
  contactLogSourceType,
  contactSummaryExcerpt,
  validateContactLog,
} from "@/server/contact-log-content";

const NOW = new Date("2026-08-21T12:00:00Z");

describe("contactLogDeliveryStatus", () => {
  // ★ The load-bearing decision of G2. Both values must be TERMINAL in the delivery state machine
  // (delivery-status-badge.tsx: delivered: [], received: []) — that is what makes it impossible for
  // sendCommunication to pick a logged call up and transmit it. Pinned as literals so a change to
  // "sent" (which transitions onward to delivered/failed) fails here rather than in production.
  it("maps inbound to the inbound terminal, received", () => {
    expect(contactLogDeliveryStatus("inbound")).toBe("received");
  });

  it("maps outbound to delivered — a call that happened WAS received", () => {
    expect(contactLogDeliveryStatus("outbound")).toBe("delivered");
  });

  it("never yields a status the send path could act on", () => {
    for (const d of ["inbound", "outbound"] as const) {
      expect(["sent", "queued", "draft", "failed"]).not.toContain(contactLogDeliveryStatus(d));
    }
  });
});

describe("contactLogSourceType", () => {
  // source_type + source_id are NOT NULL on the spine, so each direction must name a real
  // channel-detail table. These two strings are source_type enum members.
  it("routes an inbound call to inbound_messages", () => {
    expect(contactLogSourceType("inbound")).toBe("inbound_message");
  });

  it("routes an outbound call to outbound_messages", () => {
    expect(contactLogSourceType("outbound")).toBe("outbound_message");
  });
});

describe("contact-log constants", () => {
  it("writes the channel that had no writer before G2", () => {
    expect(CONTACT_LOG_CHANNEL).toBe("phone_call");
  });

  // A logged call is an internal record. If this ever flips to a *_visible value, a client or
  // vendor would start seeing the operator's private call notes.
  it("is internal-only", () => {
    expect(CONTACT_LOG_VISIBILITY).toBe("internal_only");
  });
});

describe("contactSummaryExcerpt", () => {
  it("passes a short note through unchanged", () => {
    expect(contactSummaryExcerpt("  Confirmed Thursday arrival.  ")).toBe(
      "Confirmed Thursday arrival.",
    );
  });

  it("truncates with an ellipsis, staying inside the 500-char summary column", () => {
    const long = "x".repeat(400);
    const out = contactSummaryExcerpt(long);
    expect(out).toHaveLength(198);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not truncate at exactly the boundary", () => {
    const exact = "y".repeat(200);
    expect(contactSummaryExcerpt(exact)).toBe(exact);
  });
});

describe("validateContactLog", () => {
  it("accepts a normal past call", () => {
    expect(
      validateContactLog(
        { notes: "Discussed the ETA.", occurredAt: new Date("2026-08-21T11:00:00Z") },
        NOW,
      ),
    ).toBeNull();
  });

  it("rejects empty or whitespace-only notes — a log with no content records nothing", () => {
    expect(validateContactLog({ notes: "", occurredAt: NOW }, NOW)).toBe("CONTACT_NOTES_REQUIRED");
    expect(validateContactLog({ notes: "   \n\t ", occurredAt: NOW }, NOW)).toBe(
      "CONTACT_NOTES_REQUIRED",
    );
  });

  it("rejects notes past the cap", () => {
    expect(
      validateContactLog({ notes: "z".repeat(CONTACT_NOTES_MAX + 1), occurredAt: NOW }, NOW),
    ).toBe("CONTACT_NOTES_TOO_LONG");
  });

  it("accepts notes exactly at the cap", () => {
    expect(
      validateContactLog({ notes: "z".repeat(CONTACT_NOTES_MAX), occurredAt: NOW }, NOW),
    ).toBeNull();
  });

  it("rejects an unparseable date", () => {
    expect(validateContactLog({ notes: "ok", occurredAt: new Date("nonsense") }, NOW)).toBe(
      "CONTACT_OCCURRED_AT_INVALID",
    );
  });

  // A log records what already happened; a future-dated call is a mistake or a reminder, and
  // neither belongs in the communication history.
  it("rejects a future call", () => {
    expect(
      validateContactLog(
        { notes: "ok", occurredAt: new Date("2026-08-21T13:00:00Z") },
        NOW,
      ),
    ).toBe("CONTACT_OCCURRED_AT_FUTURE");
  });

  it("tolerates a minute of clock skew rather than failing a just-ended call", () => {
    expect(
      validateContactLog(
        { notes: "ok", occurredAt: new Date("2026-08-21T12:00:30Z") },
        NOW,
      ),
    ).toBeNull();
  });

  it("reports the notes problem first when both notes and date are bad", () => {
    expect(
      validateContactLog({ notes: "", occurredAt: new Date("nonsense") }, NOW),
    ).toBe("CONTACT_NOTES_REQUIRED");
  });
});
