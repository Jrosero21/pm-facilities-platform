// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Datetime helpers shared
// across the server actions (parse a datetime-local string) and the client forms (render a Date
// back into a datetime-local input value). Mirrors the module-local parseDateTime in the
// new-dispatch action, lifted here so jobs/actions.ts reuses it (a sync helper cannot be exported
// from a "use server" file — pnpm build enforces that).

/** datetime-local string → Date, or null when blank/invalid. (new Date over a local "YYYY-MM-DDTHH:mm".) */
export function parseDateTime(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date → the value a <input type="datetime-local"> expects: "YYYY-MM-DDTHH:mm" in LOCAL time.
 * Uses the local getters (NOT toISOString, which would shift by the UTC offset and show the wrong
 * wall-clock time). Empty string for null.
 */
export function toLocalInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ★ TIMEZONE-AWARE VARIANTS — the fix for the nondeterministic basis.
//
// THE BUG THE PAIR ABOVE CAUSES. toLocalInputValue/parseDateTime read and write the wall clock of
// whatever runtime they happen to execute in. Every form using them is "use client", so that is the
// OPERATOR'S BROWSER zone — while every read surface renders through format-date.ts, which uses an
// explicit zone. Two consequences, both observed:
//   1. the same instant shows one time on the record page and another in the edit form (3h apart on
//      a Pacific laptop against the Eastern default);
//   2. two coordinators in different zones see DIFFERENT times for the same row, and a server-side
//      parse (Vercel = UTC) disagrees with both. A hardcoded wrong zone is at least consistent;
//      this is not reproducible.
//
// The pair below takes an explicit IANA zone, so the form renders and parses in the SITE's zone —
// the same basis the display formatter uses. Render and parse must ALWAYS be given the same zone:
// mixing them silently shifts the stored instant.
//
// Storage is not involved. `timestamp without time zone` round-trips losslessly through the driver
// (verified: written 2026-08-27T20:00:00Z → stored "2026-08-27 20:00:00" → read back as the same
// instant regardless of process zone). This is a DISPLAY-basis fix, not a migration.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Wall-clock parts of an instant, as seen in a given IANA zone. */
type ZonedParts = {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
};

/**
 * The wall-clock parts an instant shows in `timeZone`.
 *
 * hourCycle "h23" matters: the default en-US cycle renders midnight as hour "24" in some ICU
 * versions, which would push the reconstructed date a day forward.
 */
function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

/**
 * The zone's UTC offset in milliseconds at a given instant (positive east of UTC).
 *
 * Derived by asking Intl what the wall clock reads there and treating those parts as if they were
 * UTC — the difference from the true instant IS the offset. This is how the offset is obtained
 * without a timezone database of our own, and it stays correct across DST because Intl applies the
 * rules in force at that instant.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/** True when the string names a zone this runtime's Intl can resolve. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Date → the value a <input type="datetime-local"> expects ("YYYY-MM-DDTHH:mm"), rendered as the
 * wall clock in `timeZone` rather than in the runtime's own zone.
 *
 * Empty string for null. Falls back to the runtime-local rendering if the zone is unusable, so a
 * bad tenant value degrades to today's behaviour instead of blanking the field.
 */
export function toZonedInputValue(d: Date | null | undefined, timeZone: string): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  if (!isValidTimeZone(timeZone)) return toLocalInputValue(d);

  const p = zonedParts(d, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * datetime-local string → Date, interpreting the wall clock AS BEING IN `timeZone`.
 *
 * Two passes, which is what makes DST correct. The first guesses the instant using the offset in
 * force at the naive UTC reading; if that instant turns out to sit on the other side of a DST
 * transition, its real offset differs and the second pass corrects it. One refinement is enough:
 * transitions are at most an hour or two and never adjacent.
 *
 * Times inside a spring-forward gap do not exist in the zone (e.g. 02:30 on a US spring-forward
 * Sunday). This resolves them to the corresponding post-transition instant rather than rejecting
 * them — an operator who types a nonexistent time gets the nearest real one, not a silent null.
 *
 * Returns null for blank or unparseable input. Falls back to runtime-local parsing when the zone is
 * unusable, mirroring toZonedInputValue so the pair stays symmetric.
 */
export function parseZonedDateTime(value: string, timeZone: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  if (!isValidTimeZone(timeZone)) return parseDateTime(v);

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m) return null;

  const [y, mo, d, hh, mi, ss] = [
    Number(m[1]), Number(m[2]), Number(m[3]),
    Number(m[4] ?? "0"), Number(m[5] ?? "0"), Number(m[6] ?? "0"),
  ];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null;

  const naiveUtc = Date.UTC(y, mo - 1, d, hh, mi, ss);
  const firstGuess = new Date(naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone));
  const refined = new Date(naiveUtc - zoneOffsetMs(firstGuess, timeZone));

  return Number.isNaN(refined.getTime()) ? null : refined;
}
