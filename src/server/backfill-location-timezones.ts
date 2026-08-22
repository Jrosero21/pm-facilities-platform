import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { clientLocations } from "@/server/schema";
import { writeAuditLog } from "@/server/audit";
import { isMultiZoneState, timezoneForState } from "@/lib/us-state-timezones";

// ── TIMEZONE PART A — backfill client_locations.timezone from state_province ──
//
// client_locations.timezone has existed since Phase 19 (migration 0042) and has never been
// populated: 0 of 1 locally, 0 of 4 in prod, every row still timezone_source = 'system_default'.
// CF-19.1 banked the backfill and it was never run, so every schedule time in the product renders
// through the display fallback.
//
// ★ WHY STATE AND NOT LAT/LNG. A geocode is the precise answer, but no client_location carries
// lat/lng today, so there is nothing to geocode. state_province is NOT NULL on the table, which
// makes it the only signal actually present. timezone_source records that the value was derived
// rather than confirmed, so a later lat/lng pass can find and improve exactly these rows.
//
// ★ WHY UNKNOWN STATES STAY NULL. Writing America/New_York for an address we cannot place would be
// indistinguishable, one row later, from a timezone an operator confirmed. The display layer
// already handles NULL honestly — it falls back AND labels the zone it fell back to — so a NULL
// costs nothing and keeps the database free of guesses it cannot defend.

export type LocationTimezoneBackfillRow = {
  locationId: string;
  locationName: string;
  stateProvince: string;
  /** The zone written, or null when the state could not be resolved (row left untouched). */
  timezone: string | null;
  /** True when the state spans zones, so `timezone` is a dominant-zone approximation. */
  approximate: boolean;
};

export type LocationTimezoneBackfillResult = {
  /** Locations with a NULL timezone before the run. */
  candidates: number;
  updated: number;
  /** Rows left NULL because the state was unrecognised. */
  skipped: number;
  /** Updated rows whose state spans zones — worth an operator's eye. */
  approximate: number;
  rows: LocationTimezoneBackfillRow[];
};

/**
 * Fill in client_locations.timezone for every location that has none, deriving from state.
 *
 * Idempotent: only rows WHERE timezone IS NULL are considered, so a second run is a no-op and an
 * operator-provided value is never overwritten.
 *
 * `dryRun` performs every read and derivation but no write — the same report, no side effects. The
 * caller is expected to inspect a dry run before applying, particularly in production.
 */
export async function backfillLocationTimezones(input: {
  tenantId: string;
  dryRun?: boolean;
  /** Recorded on the audit row so a later reader can tell who ran it. */
  actorLabel?: string;
}): Promise<LocationTimezoneBackfillResult> {
  const targets = await db
    .select({
      id: clientLocations.id,
      name: clientLocations.name,
      stateProvince: clientLocations.stateProvince,
    })
    .from(clientLocations)
    .where(and(eq(clientLocations.tenantId, input.tenantId), isNull(clientLocations.timezone)));

  const rows: LocationTimezoneBackfillRow[] = [];
  let updated = 0;
  let skipped = 0;
  let approximate = 0;

  for (const loc of targets) {
    const timezone = timezoneForState(loc.stateProvince);
    const isApprox = timezone !== null && isMultiZoneState(loc.stateProvince);

    rows.push({
      locationId: loc.id,
      locationName: loc.name,
      stateProvince: loc.stateProvince,
      timezone,
      approximate: isApprox,
    });

    if (!timezone) {
      skipped += 1;
      continue;
    }
    if (isApprox) approximate += 1;

    if (!input.dryRun) {
      await db
        .update(clientLocations)
        .set({ timezone, timezoneSource: "looked_up" })
        .where(
          and(eq(clientLocations.id, loc.id), eq(clientLocations.tenantId, input.tenantId)),
        );
    }
    updated += 1;
  }

  // One audit row for the run, not one per location — this is a single administrative act, and the
  // per-row detail lives in the metadata where it stays readable.
  if (!input.dryRun && updated > 0) {
    await writeAuditLog({
      tenantId: input.tenantId,
      userId: null,
      actorLabel: input.actorLabel ?? "system:backfill-location-timezones",
      action: "client_location.timezone_backfilled",
      targetType: "client_location",
      targetId: null,
      metadata: {
        candidates: targets.length,
        updated,
        skipped,
        approximate,
        derivedFrom: "state_province",
        source: "looked_up",
        rows: rows.filter((r) => r.timezone !== null),
      },
    });
  }

  return { candidates: targets.length, updated, skipped, approximate, rows };
}
