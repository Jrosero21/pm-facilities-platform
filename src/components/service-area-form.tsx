"use client";

import { useActionState, useState } from "react";
import type { CoverageActionState } from "@/app/(app)/vendors/coverage-actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type CoverageAction = (
  prev: CoverageActionState,
  formData: FormData,
) => Promise<CoverageActionState>;

type AreaType = "radius" | "postal_code" | "city" | "county" | "state" | "national";

const AREA_TYPE_OPTIONS: { value: AreaType; label: string }[] = [
  { value: "radius", label: "Radius" },
  { value: "postal_code", label: "Postal code" },
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "state", label: "State" },
  { value: "national", label: "National" },
];

function Field({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      <input
        name={name}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

export function ServiceAreaForm({
  action,
  locations,
}: {
  action: CoverageAction;
  locations: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<CoverageActionState, FormData>(
    action,
    null,
  );
  // Drives which value fields are rendered. Only the visible fields are
  // submitted; the action reads only the ones relevant to the chosen type.
  const [areaType, setAreaType] = useState<AreaType>("radius");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Area type</span>
          <select
            name="areaType"
            value={areaType}
            onChange={(e) => setAreaType(e.target.value as AreaType)}
            className={inputClass}
          >
            {AREA_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Label <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input
            name="areaLabel"
            autoComplete="off"
            placeholder="e.g. Phoenix metro"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Scope</span>
          <select name="vendorLocationId" defaultValue="" className={inputClass}>
            <option value="">All locations (vendor-wide)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {areaType === "radius" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Center latitude" name="centerLatitude" placeholder="33.4484" />
          <Field label="Center longitude" name="centerLongitude" placeholder="-112.0740" />
          <Field label="Radius (miles)" name="radiusMiles" placeholder="25" />
        </div>
      )}

      {areaType === "postal_code" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Postal code" name="postalCode" placeholder="85004" />
        </div>
      )}

      {areaType === "city" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="City" name="city" placeholder="Phoenix" />
          <Field label="State" name="stateCode" placeholder="AZ" />
        </div>
      )}

      {areaType === "county" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="County" name="countyName" placeholder="Maricopa" />
          <Field label="State" name="stateCode" placeholder="AZ" />
        </div>
      )}

      {areaType === "state" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="State" name="stateCode" placeholder="AZ" />
        </div>
      )}

      {areaType === "national" && (
        <p className="text-sm text-neutral-600">
          Covers the entire country — no additional fields needed.
        </p>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add service area"}
      </button>
    </form>
  );
}
