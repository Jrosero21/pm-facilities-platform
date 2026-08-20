import { describe, expect, it } from "vitest";
import {
  buildSweepNotification,
  sweepIsWorthNotifying,
  sweepNotificationBucketStart,
  sweepNotificationKey,
  type SweepCounts,
} from "@/server/sweep-notify-content";

const QUIET: SweepCounts = { swept: 0, autoSent: 0, heldForReview: 0, skipped: 0, byReason: {} };
const counts = (over: Partial<SweepCounts>): SweepCounts => ({ ...QUIET, ...over });

describe("sweepIsWorthNotifying", () => {
  // ★ The anti-noise rule. Mailing "0 and 0" every run trains the operator to ignore the sender,
  // which destroys the value of the one message that matters.
  it("stays silent on a run that did nothing", () => {
    expect(sweepIsWorthNotifying(QUIET)).toBe(false);
  });

  it("stays silent when jobs were only considered", () => {
    expect(sweepIsWorthNotifying(counts({ swept: 12 }))).toBe(false);
  });

  // A job held back by cooldown is the system working as designed, not something to act on.
  it("stays silent when jobs were only skipped", () => {
    expect(sweepIsWorthNotifying(counts({ swept: 5, skipped: 5, byReason: { cooldown: 5 } }))).toBe(
      false,
    );
  });

  it("fires when something was re-dispatched", () => {
    expect(sweepIsWorthNotifying(counts({ swept: 1, autoSent: 1 }))).toBe(true);
  });

  it("fires when something was held for a human", () => {
    expect(sweepIsWorthNotifying(counts({ swept: 1, heldForReview: 1 }))).toBe(true);
  });
});

describe("sweepNotificationKey / bucket", () => {
  const T = "019f2a92-c5dc-7473-8a54-7274a6b85bf5";

  // The cron can double-fire and each firing has its own startedAt, so the timestamp cannot be the
  // key. Two firings inside one hour must collide.
  it("is identical for two firings in the same hour", () => {
    expect(sweepNotificationKey(T, new Date("2026-08-21T14:00:01Z"))).toBe(
      sweepNotificationKey(T, new Date("2026-08-21T14:59:59Z")),
    );
  });

  it("differs across the hour boundary", () => {
    expect(sweepNotificationKey(T, new Date("2026-08-21T14:59:59Z"))).not.toBe(
      sweepNotificationKey(T, new Date("2026-08-21T15:00:00Z")),
    );
  });

  it("differs per tenant — one tenant's send never suppresses another's", () => {
    const at = new Date("2026-08-21T14:30:00Z");
    expect(sweepNotificationKey("tenant-a", at)).not.toBe(sweepNotificationKey("tenant-b", at));
  });

  it("bucket start is the top of the key's hour, in UTC", () => {
    expect(sweepNotificationBucketStart(new Date("2026-08-21T14:37:02.123Z")).toISOString()).toBe(
      "2026-08-21T14:00:00.000Z",
    );
  });

  it("does not mutate the date it is given", () => {
    const at = new Date("2026-08-21T14:37:02.123Z");
    sweepNotificationBucketStart(at);
    expect(at.toISOString()).toBe("2026-08-21T14:37:02.123Z");
  });
});

describe("buildSweepNotification", () => {
  const tenantName = "Rose Analytics";

  // ★ heldForReview is work handed BACK to a human; autoSent is work finished. The subject must
  // lead with the half that needs a person, so the operator can triage from the subject alone.
  it("leads the subject with the held count when both are present", () => {
    const { subject } = buildSweepNotification({
      counts: counts({ swept: 5, autoSent: 3, heldForReview: 2 }),
      tenantName,
    });
    expect(subject).toBe("2 jobs need review — automatic re-dispatch, Rose Analytics");
  });

  it("uses the re-dispatched count when nothing was held", () => {
    const { subject } = buildSweepNotification({
      counts: counts({ swept: 3, autoSent: 3 }),
      tenantName,
    });
    expect(subject).toBe("3 jobs re-dispatched automatically — Rose Analytics");
  });

  it("says 'job needs' for one, 'jobs need' for many", () => {
    expect(
      buildSweepNotification({ counts: counts({ heldForReview: 1 }), tenantName }).subject,
    ).toBe("1 job needs review — automatic re-dispatch, Rose Analytics");
    expect(
      buildSweepNotification({ counts: counts({ heldForReview: 3 }), tenantName }).subject,
    ).toBe("3 jobs need review — automatic re-dispatch, Rose Analytics");
  });

  it("names the tenant, so a multi-tenant operator knows whose run this was", () => {
    const { subject, body } = buildSweepNotification({
      counts: counts({ autoSent: 1 }),
      tenantName: "Acme Facilities",
    });
    expect(subject).toContain("Acme Facilities");
    expect(body).toContain("Acme Facilities");
  });

  it("tells the reader to act only when something is held", () => {
    expect(
      buildSweepNotification({ counts: counts({ heldForReview: 1 }), tenantName }).body,
    ).toContain("Open the exceptions queue");
    expect(buildSweepNotification({ counts: counts({ autoSent: 1 }), tenantName }).body).toContain(
      "No action is needed",
    );
  });

  it("lists the reason breakdown in a stable order", () => {
    const { body } = buildSweepNotification({
      counts: counts({ swept: 4, autoSent: 1, skipped: 3, byReason: { held: 1, cooldown: 2 } }),
      tenantName,
    });
    expect(body.indexOf("cooldown: 2")).toBeLessThan(body.indexOf("held: 1"));
  });

  it("omits zero-valued reasons", () => {
    const { body } = buildSweepNotification({
      counts: counts({ autoSent: 1, byReason: { cooldown: 0, held: 2 } }),
      tenantName,
    });
    expect(body).not.toContain("cooldown");
    expect(body).toContain("held: 2");
  });

  // A digest spanning many jobs, sent to staff who can open the queue themselves. Naming records
  // here would put customer detail into a message whose only purpose is "go look".
  it("carries no job, client, or money detail", () => {
    const { subject, body } = buildSweepNotification({
      counts: counts({ swept: 9, autoSent: 4, heldForReview: 2, skipped: 3, byReason: { cooldown: 3 } }),
      tenantName,
    });
    const whole = `${subject}\n${body}`;
    expect(whole).not.toMatch(/\$[\d,]/);
    expect(whole).not.toMatch(/\bWO-\d|#\d{3,}/);
  });

  it("is deterministic", () => {
    const input = { counts: counts({ autoSent: 2, heldForReview: 1 }), tenantName };
    expect(buildSweepNotification(input)).toEqual(buildSweepNotification(input));
  });
});
