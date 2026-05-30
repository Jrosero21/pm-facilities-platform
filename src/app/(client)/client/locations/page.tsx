import { requireClient } from "@/server/auth-context";
import {
  listClientLocationsDetailed,
  type ClientLocationDetailedRow,
} from "@/server/client/list-client-scoped-locations-detailed";

/**
 * Client locations — Phase 11 batch 11h (read-only).
 *
 * The client's own locations + addresses, scope-filtered. Grouped by client name
 * when the user is scoped to >1 client; flat otherwise. No actions — clients
 * don't manage locations in MVP (operators do via the admin app). Activates the
 * Locations nav link from 11d's layout.
 */
export default async function ClientLocationsPage() {
  const ctx = await requireClient();
  const locations = await listClientLocationsDetailed(
    ctx.activeTenant.tenantId,
    ctx.clientScope,
  );

  // Group by client (preserves the reader's client-name, location-name ordering).
  const groups = new Map<string, ClientLocationDetailedRow[]>();
  for (const loc of locations) {
    const list = groups.get(loc.clientName);
    if (list) list.push(loc);
    else groups.set(loc.clientName, [loc]);
  }
  const multi = groups.size > 1;

  return (
    <section className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
      </header>

      {locations.length === 0 ? (
        <p className="text-sm text-neutral-500">No locations on file.</p>
      ) : (
        [...groups.entries()].map(([clientName, locs]) => (
          <div key={clientName} className="space-y-3">
            {multi && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {clientName}
              </h2>
            )}
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {locs.map((loc) => (
                <li
                  key={loc.id}
                  className="rounded-lg border border-neutral-200 bg-white p-4"
                >
                  <p className="text-sm font-medium text-neutral-900">
                    {loc.name}
                  </p>
                  <address className="mt-1 not-italic text-sm text-neutral-600">
                    {loc.addressLine1}
                    {loc.addressLine2 ? (
                      <>
                        <br />
                        {loc.addressLine2}
                      </>
                    ) : null}
                    <br />
                    {loc.city}, {loc.stateProvince} {loc.postalCode}
                    {loc.country && loc.country !== "US" ? (
                      <>
                        <br />
                        {loc.country}
                      </>
                    ) : null}
                  </address>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
