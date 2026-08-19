import { describe, expect, it } from "vitest";

import type { JobEventListItem } from "@/server/job-events";
import type { CommunicationListItem } from "@/server/communications";
import type { JobNoteListItem } from "@/server/job-notes";
import type { BillingEvent } from "@/server/billing/events";

import { mergeTimeline } from "@/lib/timeline";

function mkDate(iso: string) {
  return new Date(iso);
}

describe("mergeTimeline", () => {
  it("merges events + billing_event + communications + notes and sorts oldest-first; same timestamp tie-break: event < billing_event < communication < note", () => {
    const sameTs = mkDate("2024-01-01T00:00:00.000Z");

    const events: JobEventListItem[] = [
      {
        id: "e-1",
        createdAt: sameTs,
        eventType: "milestone-A",
        summary: "Event summary A",
        actorName: "Actor A",
      },
      {
        id: "e-2",
        createdAt: mkDate("2023-12-31T23:59:59.000Z"),
        eventType: "milestone-B",
        summary: "Event summary B",
        actorName: null,
      },
    ];

    const billingEvents: BillingEvent[] = [
      {
        id: "b-1",
        jobId: "job-1",
        eventType: "proposal.sent",
        actorUserId: null,
        actorName: "Finance",
        summary: "Billing summary X",
        amount: null,
        currency: null,
        proposalId: null,
        changeOrderId: null,
        vendorInvoiceId: null,
        clientInvoiceId: null,
        paymentId: null,
        metadata: null,
        createdAt: sameTs,
      },
    ];

    const communications: CommunicationListItem[] = [
      {
        id: "c-1",
        createdAt: sameTs,
        channel: "email",
        direction: "outbound",
        visibility: "internal_only",
        summary: "Comm summary",
        deliveryStatus: "sent",
        sourceType: "dispatch_message",
        sourceId: "src-1",
        recipientType: "none",
        recipientEmail: "rcpt@example.com",
        sentAt: null,
        deliveredAt: null,
        sentByName: "Sender",
      },
      {
        id: "c-2",
        createdAt: mkDate("2024-01-01T00:00:00.000Z"),
        channel: "sms",
        direction: "inbound",
        visibility: "internal_only",
        summary: "Comm summary 2",
        deliveryStatus: "delivered",
        sourceType: "outbound_message",
        sourceId: "src-2",
        recipientType: "none",
        recipientEmail: null,
        sentAt: null,
        deliveredAt: null,
        sentByName: null,
      },
    ];

    const notes: JobNoteListItem[] = [
      {
        id: "n-1",
        jobId: "job-1",
        createdAt: sameTs,
        visibility: "internal_only",
        body: "N".repeat(20) + "-end",
        origin: "operator",
        authorName: null,
      },
    ];

    const result = mergeTimeline(events, communications, notes, billingEvents);

    // Oldest-first across all sources.
    // For same timestamp, the implementation ranks: event (0) < billing_event (1) < communication (2) < note (3).
    expect(result[0].id).toBe("e-2");
    expect(result.map((r) => r.kind)).toEqual([
      "event",
      "event",
      "billing_event",
      "communication",
      "communication",
      "note",
    ]);

    // Also assert excerpt shaping for note.
    const noteRow = result.find((r) => r.kind === "note");
    expect(noteRow).toBeDefined();
    if (noteRow && noteRow.kind === "note") {
      // bodyExcerpt should contain the note body verbatim when it is short.
      expect(noteRow.bodyExcerpt).toContain("N".repeat(20));
      expect(noteRow.bodyExcerpt.endsWith("…")).toBe(false);
    }
  });

  it("handles empty inputs for every source (including default parameters) by returning an empty array", () => {
    expect(mergeTimeline([], [], [], [])).toEqual([]);
    expect(mergeTimeline([], [])).toEqual([]);
  });

  it("handles same-instant timestamps with each tie-break category present; also pins note excerpt truncation (200 chars with ellipsis)", () => {
    const ts = mkDate("2024-02-02T12:34:56.000Z");

    const longBody = "x".repeat(250);

    const result = mergeTimeline(
      [
        {
          id: "e",
          createdAt: ts,
          eventType: "milestone-E",
          summary: "ES",
          actorName: null,
        },
      ],
      [
        {
          id: "c",
          createdAt: ts,
          channel: "email",
          direction: "outbound",
          visibility: "internal_only",
          summary: "CS",
          deliveryStatus: "sent",
          sourceType: "dispatch_message",
          sourceId: "src-1",
          recipientType: "none",
          recipientEmail: null,
          sentAt: null,
          deliveredAt: null,
          sentByName: null,
        },
      ],
      [
        {
          id: "n",
          jobId: "job-1",
          createdAt: ts,
          visibility: "internal_only",
          body: longBody,
          origin: "operator",
          authorName: null,
        },
      ],
      [
        {
          id: "b",
          jobId: "job-1",
          eventType: "proposal.sent",
          actorUserId: null,
          actorName: null,
          summary: "BS",
          amount: "10.00",
          currency: "USD",
          proposalId: null,
          changeOrderId: null,
          vendorInvoiceId: null,
          clientInvoiceId: null,
          paymentId: null,
          metadata: null,
          createdAt: ts,
        },
      ],
    );

    expect(result).toHaveLength(4);

    // Exact ordering for different ranks at same timestamp.
    expect(result.map((r) => r.kind)).toEqual(["event", "billing_event", "communication", "note"]);

    const noteRow = result.find((r) => r.kind === "note");
    expect(noteRow).toBeDefined();
    if (noteRow && noteRow.kind === "note") {
      // excerpt(s, 200) => 199 chars + ellipsis
      expect(noteRow.bodyExcerpt.length).toBe(200);
      expect(noteRow.bodyExcerpt.endsWith("…")).toBe(true);
    }
  });
});
