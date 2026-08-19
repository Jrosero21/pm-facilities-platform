// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Relative time helpers
// where the "clock" is always injected via parameters (never call Date.now() / new Date() in
// this module). Exported functions are deterministic and unit-test friendly.

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Format a Date relative to an injected "now" Date.
 *
 * Uses the signed difference cascade on the value minus now:
 * - abs(diff) < 60s => seconds
 * - else abs(diff) < 60m => minutes (Math.round)
 * - else abs(diff) < 24h => hours (Math.round)
 * - else abs(diff) < 30d => days
 * - else abs(diff) < 12m => months by dividing days by 30
 * - else years by dividing months by 12
 */
export function relativeTime(value: Date, now: Date): string {
  const diffMs = value.getTime() - now.getTime();
  const diffSeconds = diffMs / 1000;

  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return rtf.format(Math.trunc(diffSeconds), "second");
  }

  const diffMinutes = diffSeconds / 60;
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 60) {
    return rtf.format(Math.round(diffMinutes), "minute");
  }

  const diffHours = diffMinutes / 60;
  const absHours = Math.abs(diffHours);

  if (absHours < 24) {
    return rtf.format(Math.round(diffHours), "hour");
  }

  const diffDays = diffHours / 24;
  const absDays = Math.abs(diffDays);

  if (absDays < 30) {
    return rtf.format(Math.round(diffDays), "day");
  }

  const diffMonths = diffDays / 30;
  const absMonths = Math.abs(diffMonths);

  if (absMonths < 12) {
    return rtf.format(Math.round(diffMonths), "month");
  }

  const diffYears = diffMonths / 12;
  return rtf.format(Math.round(diffYears), "year");
}

/**
 * Render a non-negative elapsed duration compactly, flooring to units.
 * - negative inputs clamp to 0s
 * - non-finite inputs render unknown
 */
export function compactAge(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";

  const s = seconds < 0 ? 0 : seconds;

  const totalSeconds = Math.floor(s);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds - totalMinutes * 60;
  void remainderSeconds;

  if (totalMinutes < 60) return `${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h`;

  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d`;
}
