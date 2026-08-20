// PURE sweep-notification rules — NO "server-only", NO DB/env/IO, so vitest reaches it.
// The subject/body and the idempotency key are the parts worth pinning: one is what a human reads
// at 7am, the other is what stops them reading it twice.

export type SweepCounts = {
  swept: number;
  autoSent: number;
  heldForReview: number;
  skipped: number;
  byReason: Record<string, number>;
};

/**
 * ★ FIRE ONLY ON ACTIVITY. A sweep that scanned nothing, or scanned and did nothing, is not news —
 * mailing "0 re-dispatched, 0 held" every run trains the operator to ignore the sender, which
 * destroys the value of the one message that matters. Skipped-only runs are also silent: a job held
 * back by cooldown is the system working as designed, not something a human must act on.
 */
export function sweepIsWorthNotifying(counts: SweepCounts): boolean {
  return counts.autoSent > 0 || counts.heldForReview > 0;
}

/**
 * A stable key for one tenant's sweep notification within one UTC hour.
 *
 * The cron can double-fire (a retry, an overlapping manual invoke, a platform redelivery) and each
 * firing produces its own `startedAt`, so the timestamp itself cannot be the key. Bucketing to the
 * hour means a second firing inside the same hour computes the SAME key and is recognised as a
 * duplicate. An hour is chosen to match the sweep's own cooldown scale: two genuine sweeps worth
 * two separate emails will not land in the same hour.
 *
 * Passed to the provider as the idempotency key AND used to look for an existing audit row, so the
 * guard holds even against a provider that does not honour idempotency keys (the CaptureProvider
 * does not).
 */
export function sweepNotificationKey(tenantId: string, at: Date): string {
  const iso = at.toISOString(); // 2026-08-21T14:37:02.123Z
  return `sweep:${tenantId}:${iso.slice(0, 13)}`; // …:2026-08-21T14
}

/** The start of the key's hour bucket — the lower bound for the duplicate-audit lookup. */
export function sweepNotificationBucketStart(at: Date): Date {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export type SweepNotificationInput = {
  counts: SweepCounts;
  /** The tenant's own name, so a multi-tenant operator knows whose overnight run this was. */
  tenantName: string;
};

export type SweepNotificationContent = { subject: string; body: string };

/** Pluralise a count with its noun: 1 job / 2 jobs. */
function n(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Pure content builder.
 *
 * ★ THE HELD COUNT LEADS. autoSent is work the system finished; heldForReview is work it stopped
 * and handed back. Only the second one needs a person, so when both are present the subject names
 * the held count first — the operator should be able to decide whether to open this from the
 * subject line alone.
 *
 * No job numbers, no client names, no money. This is an operational digest across potentially many
 * jobs, and the recipients are staff who can open the queue; naming records here would put customer
 * detail in an email that exists only to say "go look".
 */
export function buildSweepNotification(
  input: SweepNotificationInput,
): SweepNotificationContent {
  const { autoSent, heldForReview, swept, skipped, byReason } = input.counts;

  const subject =
    heldForReview > 0
      ? `${n(heldForReview, "job")} need${heldForReview === 1 ? "s" : ""} review — automatic re-dispatch, ${input.tenantName}`
      : `${n(autoSent, "job")} re-dispatched automatically — ${input.tenantName}`;

  const lines: string[] = [
    `The automatic re-dispatch run for ${input.tenantName} has finished.`,
    "",
  ];
  if (heldForReview > 0) {
    lines.push(
      `★ ${n(heldForReview, "job")} held for review — the system stopped short of acting and needs an operator.`,
    );
  }
  if (autoSent > 0) {
    lines.push(`${n(autoSent, "job")} re-dispatched automatically.`);
  }
  lines.push(`${n(swept, "job")} considered in total.`);
  if (skipped > 0) {
    lines.push(`${n(skipped, "job")} skipped.`);
  }

  const reasons = Object.entries(byReason)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (reasons.length > 0) {
    lines.push("");
    lines.push("Breakdown:");
    for (const [reason, count] of reasons) lines.push(`  ${reason}: ${count}`);
  }

  lines.push("");
  lines.push(
    heldForReview > 0
      ? "Open the exceptions queue to review the held jobs."
      : "No action is needed — this is a record of what ran.",
  );

  return { subject, body: lines.join("\n") };
}
