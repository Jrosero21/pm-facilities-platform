// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Date/time
// formatter that renders using an explicit IANA timeZone via Intl.DateTimeFormat.

const EM_DASH = "—";

/** Returns true when the Date is invalid. */
function isInvalidDate(d: Date): boolean {
  return Number.isNaN(d.getTime());
}

/**
 * Formats a Date as "Aug 18, 2026" using Intl.DateTimeFormat with locale "en-US".
 * Uses the explicit timeZone (defaults to "America/New_York").
 * Returns an em dash for null/undefined/Invalid Date.
 */
export function formatDate(value: Date | null | undefined, timeZone?: string): string {
  if (!value) return EM_DASH;
  if (isInvalidDate(value)) return EM_DASH;

  const tz = timeZone ?? "America/New_York";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return formatter.format(value);
}

/**
 * Formats a Date as "Aug 18, 2026, 3:04 PM" using Intl.DateTimeFormat with locale "en-US".
 * Uses the explicit timeZone (defaults to "America/New_York").
 * Returns an em dash for null/undefined/Invalid Date.
 */
export function formatDateTime(value: Date | null | undefined, timeZone?: string): string {
  if (!value) return EM_DASH;
  if (isInvalidDate(value)) return EM_DASH;

  const tz = timeZone ?? "America/New_York";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return formatter.format(value);
}
