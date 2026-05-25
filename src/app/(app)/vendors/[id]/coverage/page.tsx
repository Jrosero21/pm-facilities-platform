import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getVendor } from "@/server/vendors";
import { listActiveTrades } from "@/server/trades";
import { listVendorLocations } from "@/server/vendor-locations";
import {
  listVendorTradeCoverage,
  type VendorTradeCoverageListItem,
} from "@/server/vendor-trade-coverage";
import {
  listVendorServiceAreas,
  type VendorServiceAreaListItem,
} from "@/server/vendor-service-areas";
import {
  createServiceAreaAction,
  createTradeCoverageAction,
} from "@/app/(app)/vendors/coverage-actions";
import { TradeCoverageForm } from "@/components/trade-coverage-form";
import { ServiceAreaForm } from "@/components/service-area-form";

const areaTypeLabel: Record<VendorServiceAreaListItem["areaType"], string> = {
  radius: "Radius",
  postal_code: "Postal code",
  city: "City",
  county: "County",
  state: "State",
  national: "National",
};

function areaCoverageDetail(a: VendorServiceAreaListItem): string {
  switch (a.areaType) {
    case "radius":
      return `${a.radiusMiles ?? "?"} mi @ ${a.centerLatitude ?? "?"}, ${a.centerLongitude ?? "?"}`;
    case "postal_code":
      return a.postalCode ?? "—";
    case "city":
      return `${a.city ?? "—"}, ${a.stateCode ?? "—"}`;
    case "county":
      return `${a.countyName ?? "—"} County, ${a.stateCode ?? "—"}`;
    case "state":
      return a.stateCode ?? "—";
    case "national":
      return "Nationwide";
  }
}

function scopeLabel(locationName: string | null): string {
  return locationName ?? "Vendor-wide";
}

export default async function VendorCoveragePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const vendor = await getVendor(ctx.activeTenant.tenantId, id);
  if (!vendor) notFound();

  const tenantId = ctx.activeTenant.tenantId;
  const [trades, locationRows, coverage, areas] = await Promise.all([
    listActiveTrades(),
    listVendorLocations(tenantId, id),
    listVendorTradeCoverage(tenantId, id),
    listVendorServiceAreas(tenantId, id),
  ]);

  const tradeOptions = trades.map((t) => ({ id: t.id, name: t.name }));
  const locationOptions = locationRows.map((l) => ({ id: l.id, name: l.name }));
  const addTrade = createTradeCoverageAction.bind(null, id);
  const addArea = createServiceAreaAction.bind(null, id);

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/vendors" className="hover:text-neutral-900">
          Vendors
        </Link>{" "}
        /{" "}
        <Link href={`/vendors/${id}`} className="hover:text-neutral-900">
          {vendor.name}
        </Link>{" "}
        / Coverage
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {vendor.name} — Coverage
      </h1>

      {/* Trade coverage */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Trade coverage</h2>
        <div className="mt-3">
          <TradeCoverageList coverage={coverage} />
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add trade coverage</h3>
          <div className="mt-3">
            <TradeCoverageForm
              action={addTrade}
              trades={tradeOptions}
              locations={locationOptions}
            />
          </div>
        </div>
      </section>

      {/* Service areas */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-900">Service areas</h2>
        <div className="mt-3">
          <ServiceAreaList areas={areas} />
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add service area</h3>
          <div className="mt-3">
            <ServiceAreaForm action={addArea} locations={locationOptions} />
          </div>
        </div>
      </section>
    </div>
  );
}

function TradeCoverageList({
  coverage,
}: {
  coverage: VendorTradeCoverageListItem[];
}) {
  if (coverage.length === 0) {
    return <p className="text-sm text-neutral-600">No trade coverage yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Trade</th>
            <th className="px-4 py-2 font-medium">Primary</th>
            <th className="px-4 py-2 font-medium">Scope</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {coverage.map((c) => (
            <tr key={c.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 font-medium text-neutral-900">{c.tradeName}</td>
              <td className="px-4 py-2 text-neutral-600">
                {c.isPrimary ? (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">
                    primary
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2 text-neutral-600">{scopeLabel(c.locationName)}</td>
              <td className="px-4 py-2 text-neutral-600">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceAreaList({ areas }: { areas: VendorServiceAreaListItem[] }) {
  if (areas.length === 0) {
    return <p className="text-sm text-neutral-600">No service areas yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Area</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Scope</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {areas.map((a) => (
            <tr key={a.id} className="hover:bg-neutral-50">
              {/* Prefer the operator's label; fall back to the type-specific
                  coords/values only when the area is unlabeled. */}
              <td className="px-4 py-2 font-medium text-neutral-900">
                {a.areaLabel ?? areaCoverageDetail(a)}
              </td>
              <td className="px-4 py-2 text-neutral-600">{areaTypeLabel[a.areaType]}</td>
              <td className="px-4 py-2 text-neutral-600">{scopeLabel(a.locationName)}</td>
              <td className="px-4 py-2 text-neutral-600">{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
