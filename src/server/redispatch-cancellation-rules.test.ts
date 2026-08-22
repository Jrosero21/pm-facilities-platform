import { describe, expect, it } from "vitest";
import {
  CANCELLABLE_ASSIGNMENT_STATUSES,
  CANCELLATION_CLOSE_STATUS,
  CANCELLATION_FORBIDDEN_CLOSE_STATUS,
  CANCELLATION_NOTE_MAX,
  buildCancellationNote,
  isAgentRedispatchSuggestion,
  isCancellableStatus,
  validateRedispatchCancellation,
} from "@/server/redispatch-cancellation-rules";

// ★★ THE LIE THIS MODULE EXISTS TO FIX.
// approveRedispatch closes the replaced assignment as GHOSTED, noted "vendor did not respond".
// For a vendor who phoned ahead to cancel that is false, and GHOSTED is the strongest negative
// reliability signal the platform has — it would score a considerate vendor as a no-show on every
// future ranking. These tests pin the honest close so a future edit toward GHOSTED fails here.
describe("the close status is DECLINED, never GHOSTED", () => {
  it("closes a cancellation as DECLINED", () => {
    expect(CANCELLATION_CLOSE_STATUS).toBe("DECLINED");
  });

  it("is not GHOSTED", () => {
    expect(CANCELLATION_CLOSE_STATUS).not.toBe(CANCELLATION_FORBIDDEN_CLOSE_STATUS);
    expect(CANCELLATION_CLOSE_STATUS).not.toBe("GHOSTED");
  });
});

describe("the live-state guard — broader than approveRedispatch's SENT-only", () => {
  // A cancellation can arrive at any point before work starts. approveRedispatch only ever sees
  // SENT because it is built for silence; restricting this the same way would refuse the cases
  // that cost the most — a vendor pulling out after CONFIRMED.
  it("accepts every state a vendor can cancel from", () => {
    for (const code of ["SENT", "ACCEPTED", "SCHEDULED", "CONFIRMED"]) {
      expect(isCancellableStatus(code)).toBe(true);
    }
  });

  it("accepts more than just SENT", () => {
    expect(CANCELLABLE_ASSIGNMENT_STATUSES.length).toBeGreaterThan(1);
    expect(isCancellableStatus("CONFIRMED")).toBe(true);
  });

  // Once the vendor is on site it is a partial job or a dispute, not a re-dispatch — closing it as
  // DECLINED would misdescribe work that was actually begun.
  it("refuses ON_SITE and WORK_COMPLETE", () => {
    expect(isCancellableStatus("ON_SITE")).toBe(false);
    expect(isCancellableStatus("WORK_COMPLETE")).toBe(false);
  });

  it("refuses already-closed states", () => {
    for (const code of ["DECLINED", "CANCELLED", "GHOSTED"]) {
      expect(isCancellableStatus(code)).toBe(false);
    }
  });

  // DRAFT was never sent — there is nothing for a vendor to cancel.
  it("refuses DRAFT", () => {
    expect(isCancellableStatus("DRAFT")).toBe(false);
  });

  it("refuses an unknown status", () => {
    expect(isCancellableStatus("NOT_A_STATUS")).toBe(false);
  });
});

describe("validateRedispatchCancellation", () => {
  it("accepts a live assignment with no reason", () => {
    expect(validateRedispatchCancellation({ currentStatusCode: "CONFIRMED" })).toBeNull();
  });

  it("accepts a live assignment with a reason", () => {
    expect(
      validateRedispatchCancellation({ currentStatusCode: "SENT", note: "Truck broke down." }),
    ).toBeNull();
  });

  it("rejects a non-cancellable status", () => {
    expect(validateRedispatchCancellation({ currentStatusCode: "ON_SITE" })).toBe(
      "ASSIGNMENT_NOT_CANCELLABLE",
    );
  });

  it("rejects an over-long reason", () => {
    expect(
      validateRedispatchCancellation({
        currentStatusCode: "SENT",
        note: "x".repeat(CANCELLATION_NOTE_MAX + 1),
      }),
    ).toBe("CANCELLATION_NOTE_TOO_LONG");
  });

  it("accepts a reason exactly at the cap", () => {
    expect(
      validateRedispatchCancellation({
        currentStatusCode: "SENT",
        note: "x".repeat(CANCELLATION_NOTE_MAX),
      }),
    ).toBeNull();
  });

  // Status is checked first: an over-long reason on a terminal assignment is still, primarily, a
  // terminal assignment.
  it("reports the status problem before the note problem", () => {
    expect(
      validateRedispatchCancellation({
        currentStatusCode: "WORK_COMPLETE",
        note: "x".repeat(CANCELLATION_NOTE_MAX + 1),
      }),
    ).toBe("ASSIGNMENT_NOT_CANCELLABLE");
  });
});

describe("buildCancellationNote", () => {
  // The note must survive a future rework of the status vocabulary: whatever the status ends up
  // called, the history row still says the vendor cancelled and a coordinator recorded it.
  it("states the vendor cancelled and who recorded it", () => {
    expect(buildCancellationNote(null)).toBe("Vendor cancelled (recorded by coordinator).");
  });

  it("includes the operator's reason when given", () => {
    expect(buildCancellationNote("Truck broke down")).toBe(
      "Vendor cancelled (recorded by coordinator): Truck broke down",
    );
  });

  it("treats a whitespace-only reason as absent", () => {
    expect(buildCancellationNote("   ")).toBe("Vendor cancelled (recorded by coordinator).");
  });

  it("never describes the vendor as unresponsive", () => {
    for (const reason of [null, "Double-booked", "   "]) {
      const note = buildCancellationNote(reason).toLowerCase();
      expect(note).not.toContain("did not respond");
      expect(note).not.toContain("ghost");
      expect(note).not.toContain("no response");
    }
  });
});

// ★ The gate that stops an operator's cancellation replacement inheriting the AGENT's ghost-flow
// button — a button whose caption says it will "ghost the unresponsive vendor", on a record created
// specifically to say the vendor DID respond. Both paths set replaces_assignment_id, so the
// replaced assignment's STATE is the only honest discriminator.
describe("isAgentRedispatchSuggestion — which controls a replacement DRAFT shows", () => {
  it("is an agent suggestion while the replaced assignment is still SENT", () => {
    expect(isAgentRedispatchSuggestion("SENT")).toBe(true);
  });

  // The operator path closes the old assignment as DECLINED BEFORE the replacement exists, so this
  // is the case that must fall through to the ordinary Send controls.
  it("is NOT an agent suggestion once an operator closed the replaced assignment", () => {
    expect(isAgentRedispatchSuggestion("DECLINED")).toBe(false);
  });

  it("is not an agent suggestion for any other replaced state", () => {
    for (const code of ["ACCEPTED", "SCHEDULED", "CONFIRMED", "ON_SITE", "WORK_COMPLETE", "CANCELLED", "GHOSTED", "DRAFT"]) {
      expect(isAgentRedispatchSuggestion(code)).toBe(false);
    }
  });

  // A dispatch that replaces nothing has no replaced status at all.
  it("is not an agent suggestion when there is no replaced assignment", () => {
    expect(isAgentRedispatchSuggestion(null)).toBe(false);
    expect(isAgentRedispatchSuggestion(undefined)).toBe(false);
  });
});
