// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Date/time
// formatter that renders using an explicit IANA timeZone via Intl.DateTimeFormat.

const EM_DASH = "—";

/**
 * ★ THE ZONE USED WHEN A SITE HAS NONE.
 *
 * client_locations.timezone is nullable and currently empty everywhere (0 of 1 locally, 0 of 4 in
 * prod), so this fallback is the LIVE path, not an edge case. It is deliberately paired with the
 * zone LABEL on formatDateTime: a fallback render still states which zone it is claiming, so an
 * operator in California reading "4:00 PM EDT" can see the assumption rather than silently trusting
 * a wrong number. An unlabeled time is the thing this module exists to stop producing.
 */
export const DEFAULT_DISPLAY_TIME_ZONE = "America/New_York";

/** Returns true when the Date is invalid. */
function isInvalidDate(d: Date): boolean {
  return Number.isNaN(d.getTime());
}

/**
 * Formats a Date as "Aug 18, 2026" using Intl.DateTimeFormat with locale "en-US".
 * Uses the explicit timeZone (defaults to DEFAULT_DISPLAY_TIME_ZONE).
 * Returns an em dash for null/undefined/Invalid Date.
 *
 * ★ Deliberately NOT zone-labeled, unlike formatDateTime. The zone still decides WHICH calendar day
 * an instant falls on near midnight, so passing it matters — but "Aug 18, 2026 EDT" reads as a
 * mistake, and a date has no wall-clock a reader could misapply. Labels go where a time is shown.
 */
export function formatDate(value: Date | null | undefined, timeZone?: string): string {
  if (!value) return EM_DASH;
  if (isInvalidDate(value)) return EM_DASH;

  const tz = timeZone ?? DEFAULT_DISPLAY_TIME_ZONE;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return formatter.format(value);
}

/**
 * Formats a Date as "Aug 18, 2026, 3:04 PM EDT" using Intl.DateTimeFormat with locale "en-US".
 * Uses the explicit timeZone (defaults to DEFAULT_DISPLAY_TIME_ZONE) and ALWAYS labels the zone.
 * Returns an em dash for null/undefined/Invalid Date.
 */
export function formatDateTime(value: Date | null | undefined, timeZone?: string): string {
  if (!value) return EM_DASH;
  if (isInvalidDate(value)) return EM_DASH;

  const tz = timeZone ?? DEFAULT_DISPLAY_TIME_ZONE;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    // ★ The zone label — the point of the whole change. A schedule time without a zone is not
    // actionable: a vendor two states away cannot tell 4:00 PM Eastern from 4:00 PM local, and an
    // operator cannot tell a site-zone render from a fallback. "short" gives the real abbreviation
    // and follows DST (EDT in August, EST in January), unlike a static "(site time)" suffix.
    // Note: timeZoneName cannot be combined with dateStyle/timeStyle — it works here only because
    // this formatter spells out its components.
    timeZoneName: "short",
  });

  return formatter.format(value);
}

/**
 * The short zone abbreviation for a zone at a given instant — "EDT", "PST", "HST".
 *
 * DST-dependent, which is why it takes an instant: the same zone is EDT in August and EST in
 * January, and a form labeled with the wrong half of the year is worse than one labeled with none.
 * Used to tell an operator which basis a datetime input is in, since an <input type="datetime-local">
 * cannot carry a zone of its own.
 *
 * Falls back to the zone id itself if the abbreviation cannot be produced — an ugly label beats a
 * thrown render.
 */
export function timeZoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
