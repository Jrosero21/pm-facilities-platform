import { describe, expect, it } from "vitest";
import {
  OPERATOR_PRESENCE_AUDIT_ACTIONS,
  OPERATOR_PRESENCE_EVENT_TYPES,
  PRESENCE_NOTE_MAX,
  shouldUpdateScheduledStart,
  validateEtaRecord,
  validatePresenceRecord,
} from "@/server/operator-presence-rules";

const NOW = new Date("2026-08-21T15:00:00Z");

describe("shouldUpdateScheduledStart — the one non-presence write", () => {
  // ★ The load-bearing default. scheduledStartAt is what the work order PDF prints as
  // "Scheduled start", so flipping this to default-true would silently rewrite a vendor-facing
  // commitment every time a coordinator noted what a vendor said on the phone.
  it("is false unless explicitly true", () => {
    expect(shouldUpdateScheduledStart(undefined)).toBe(false);
    expect(shouldUpdateScheduledStart(false)).toBe(false);
  });

  it("is true only for an explicit true", () => {
    expect(shouldUpdateScheduledStart(true)).toBe(true);
  });
});

describe("validatePresenceRecord — check-in / check-out", () => {
  it("accepts a past arrival", () => {
    expect(
      validatePresenceRecord({ occurredAt: new Date("2026-08-21T14:00:00Z") }, NOW),
    ).toBeNull();
  });

  it("accepts exactly now", () => {
    expect(validatePresenceRecord({ occurredAt: NOW }, NOW)).toBeNull();
  });

  // ★ The rule that keeps a check-in from blurring into an ETA: a check-in asserts the vendor HAS
  // arrived. A future one is a prediction, which is a different table and a different verb.
  it("rejects a future arrival", () => {
    expect(
      validatePresenceRecord({ occurredAt: new Date("2026-08-21T16:00:00Z") }, NOW),
    ).toBe("PRESENCE_OCCURRED_AT_FUTURE");
  });

  it("tolerates a minute of clock skew rather than failing a just-happened arrival", () => {
    expect(
      validatePresenceRecord({ occurredAt: new Date("2026-08-21T15:00:30Z") }, NOW),
    ).toBeNull();
  });

  it("rejects an unparseable date", () => {
    expect(validatePresenceRecord({ occurredAt: new Date("nonsense") }, NOW)).toBe(
      "PRESENCE_OCCURRED_AT_INVALID",
    );
  });

  it("rejects a note past the column width", () => {
    expect(
      validatePresenceRecord({ occurredAt: NOW, note: "x".repeat(PRESENCE_NOTE_MAX + 1) }, NOW),
    ).toBe("PRESENCE_NOTE_TOO_LONG");
  });

  it("accepts a note exactly at the column width", () => {
    expect(
      validatePresenceRecord({ occurredAt: NOW, note: "x".repeat(PRESENCE_NOTE_MAX) }, NOW),
    ).toBeNull();
  });

  it("accepts an absent note", () => {
    expect(validatePresenceRecord({ occurredAt: NOW, note: null }, NOW)).toBeNull();
  });
});

describe("validateEtaRecord", () => {
  // ★ The deliberate asymmetry with validatePresenceRecord: an ETA is ABOUT the future.
  it("accepts a future ETA — that is what an ETA is", () => {
    expect(
      validateEtaRecord({ etaStartAt: new Date("2026-08-21T18:00:00Z") }),
    ).toBeNull();
  });

  it("also accepts a past ETA (a late-recorded call about an earlier promise)", () => {
    expect(
      validateEtaRecord({ etaStartAt: new Date("2026-08-21T09:00:00Z") }),
    ).toBeNull();
  });

  it("accepts a valid window", () => {
    expect(
      validateEtaRecord(
        {
          etaStartAt: new Date("2026-08-21T18:00:00Z"),
          etaEndAt: new Date("2026-08-21T20:00:00Z"),
        },
      ),
    ).toBeNull();
  });

  it("rejects a window that ends before it starts", () => {
    expect(
      validateEtaRecord(
        {
          etaStartAt: new Date("2026-08-21T18:00:00Z"),
          etaEndAt: new Date("2026-08-21T17:00:00Z"),
        },
      ),
    ).toBe("PRESENCE_ETA_END_BEFORE_START");
  });

  it("accepts a zero-length window (start === end)", () => {
    const at = new Date("2026-08-21T18:00:00Z");
    expect(validateEtaRecord({ etaStartAt: at, etaEndAt: at })).toBeNull();
  });

  it("rejects an unparseable start or end", () => {
    expect(validateEtaRecord({ etaStartAt: new Date("nope") })).toBe(
      "PRESENCE_OCCURRED_AT_INVALID",
    );
    expect(
      validateEtaRecord({ etaStartAt: NOW, etaEndAt: new Date("nope") }),
    ).toBe("PRESENCE_OCCURRED_AT_INVALID");
  });

  it("rejects an over-long note", () => {
    expect(
      validateEtaRecord({ etaStartAt: NOW, note: "x".repeat(PRESENCE_NOTE_MAX + 1) }),
    ).toBe("PRESENCE_NOTE_TOO_LONG");
  });
});

// ★ Provenance is carried ONLY by these names — the presence rows have no source column — so a
// rename silently destroys the operator-relayed vs vendor-self-reported distinction in the audit
// log. Pinned as literals for exactly that reason.
describe("provenance is in the audit action name", () => {
  it("marks every operator action as relayed", () => {
    for (const action of Object.values(OPERATOR_PRESENCE_AUDIT_ACTIONS)) {
      expect(action.endsWith(".operator_relayed")).toBe(true);
    }
  });

  it("pins the three action names", () => {
    expect(OPERATOR_PRESENCE_AUDIT_ACTIONS).toEqual({
      eta: "assignment.eta_recorded.operator_relayed",
      check_in: "assignment.checkin_recorded.operator_relayed",
      check_out: "assignment.checkout_recorded.operator_relayed",
    });
  });

  // The vendor path audits job_vendor_assignment.* — the operator path must NOT collide with it,
  // or the two doors become indistinguishable in the audit log.
  it("does not reuse the vendor path's action namespace", () => {
    for (const action of Object.values(OPERATOR_PRESENCE_AUDIT_ACTIONS)) {
      expect(action.startsWith("job_vendor_assignment.")).toBe(false);
    }
  });

  it("gives each kind a distinct timeline event type", () => {
    const types = Object.values(OPERATOR_PRESENCE_EVENT_TYPES);
    expect(new Set(types).size).toBe(types.length);
  });
});
