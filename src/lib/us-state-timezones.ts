// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Maps a US state/territory
// code to an IANA timezone, for backfilling client_locations.timezone where no operator-provided
// value exists.
//
// ★ WHY A STATE MAP AND NOT A GEOCODE. The precise answer is a lat/lng → timezone lookup, but no
// client_location currently carries lat/lng (checked: 0 of 4 in prod, 0 of 1 locally), so a
// geocoder would have nothing to consume. State is the coarsest input that is actually POPULATED
// (state_province is NOT NULL on the table), which makes it the only backfill available today.
// When lat/lng arrives, a looked_up value can be re-derived more precisely — timezone_source
// records which method produced the value, so a later pass can tell them apart.

/**
 * ★ STATES THAT SPAN MORE THAN ONE ZONE — the map below picks the DOMINANT zone (the one holding
 * the large majority of the population), which is an APPROXIMATION and can be wrong for a specific
 * address. Flagged rather than hidden so a caller can decline the guess or ask an operator.
 *
 * Known wrong-side examples the dominant pick misses: the Florida panhandle (Central, not Eastern),
 * the Idaho panhandle (Pacific, not Mountain), west Texas / El Paso (Mountain, not Central),
 * upper-peninsula and far-west Michigan (Central), western Kentucky and western Kansas, eastern
 * Oregon, and eastern Tennessee (Eastern, not Central).
 *
 * Not a concern for the data in hand — every existing location is NY or CA, both single-zone — but
 * a Texas or Florida client would need the operator-provided value.
 */
export const MULTI_ZONE_STATES: ReadonlySet<string> = new Set([
  "AK", "AZ", "FL", "ID", "IN", "KS", "KY", "MI", "ND", "NE", "OR", "SD", "TN", "TX",
]);

/**
 * US state/territory code → IANA timezone. Dominant zone for the states in MULTI_ZONE_STATES.
 *
 * Arizona maps to America/Phoenix (no DST) rather than America/Denver — the Navajo Nation does
 * observe DST, but Phoenix is right for the overwhelming majority of Arizona addresses.
 */
export const US_STATE_TIMEZONES: Readonly<Record<string, string>> = {
  // ── Eastern ──
  CT: "America/New_York", DC: "America/New_York", DE: "America/New_York",
  GA: "America/New_York", MA: "America/New_York", MD: "America/New_York",
  ME: "America/New_York", NC: "America/New_York", NH: "America/New_York",
  NJ: "America/New_York", NY: "America/New_York", OH: "America/New_York",
  PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  VA: "America/New_York", VT: "America/New_York", WV: "America/New_York",
  FL: "America/New_York", // panhandle is Central
  IN: "America/Indiana/Indianapolis", // a few NW/SW counties are Central
  KY: "America/New_York", // western KY is Central
  MI: "America/Detroit", // far-west UP is Central

  // ── Central ──
  AL: "America/Chicago", AR: "America/Chicago", IA: "America/Chicago",
  IL: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago",
  MO: "America/Chicago", MS: "America/Chicago", OK: "America/Chicago",
  WI: "America/Chicago",
  KS: "America/Chicago", // far-west KS is Mountain
  ND: "America/Chicago", // southwest ND is Mountain
  NE: "America/Chicago", // western NE is Mountain
  SD: "America/Chicago", // western SD is Mountain
  TN: "America/Chicago", // eastern TN is Eastern
  TX: "America/Chicago", // far-west TX (El Paso) is Mountain

  // ── Mountain ──
  CO: "America/Denver", MT: "America/Denver", NM: "America/Denver",
  UT: "America/Denver", WY: "America/Denver",
  AZ: "America/Phoenix", // no DST; Navajo Nation does observe it
  ID: "America/Boise", // northern panhandle is Pacific

  // ── Pacific ──
  CA: "America/Los_Angeles", NV: "America/Los_Angeles", WA: "America/Los_Angeles",
  OR: "America/Los_Angeles", // eastern OR is Mountain

  // ── Non-contiguous + territories ──
  AK: "America/Anchorage", // the Aleutians west of 169°30′W are America/Adak
  HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico", VI: "America/St_Thomas", GU: "Pacific/Guam",
  AS: "Pacific/Pago_Pago", MP: "Pacific/Saipan",
};

/**
 * Resolve a state/territory code to an IANA timezone.
 *
 * Returns null for anything unrecognised — including non-US addresses — so the CALLER decides what
 * an unknown state means. Deliberately does not fall back to a default: a wrong timezone written
 * into the database as though it were looked up is worse than an honest NULL, because the display
 * layer can label a fallback but cannot tell a guess from a fact once it is stored.
 */
export function timezoneForState(stateProvince: string | null | undefined): string | null {
  const key = (stateProvince ?? "").trim().toUpperCase();
  if (!key) return null;
  return US_STATE_TIMEZONES[key] ?? null;
}

/** True when the state spans zones, so the mapped value is a dominant-zone approximation. */
export function isMultiZoneState(stateProvince: string | null | undefined): boolean {
  return MULTI_ZONE_STATES.has((stateProvince ?? "").trim().toUpperCase());
}
