"use client";

import { useActionState, useState } from "react";
import {
  createClientJobAction,
  type ClientJobActionResult,
} from "@/app/(client)/client/jobs/new/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type ClientOption = { id: string; name: string };
type LocationOption = { id: string; clientId: string; name: string };

/**
 * Client work-order submission form — Phase 11 batch 11f.
 *
 * Mirrors the operator JobForm's useActionState + client-side location filter
 * (option d — all in-scope locations ship with the page; the location <select>
 * is keyed by clientId so it remounts/resets when the client changes). The
 * client <select> renders only when scoped to >1 client; with one client it is
 * pinned (no picker) and the action ignores form clientId, pinning from scope.
 * NO priority/trade/NTE/source_type fields — all server-pinned or omitted (F5a).
 * The form sends only clientId (multi only), clientLocationId, problemDescription;
 * the server re-validates clientId ∈ scope (I1).
 */
export function NewJobForm({
  clients,
  locations,
}: {
  clients: ClientOption[];
  locations: LocationOption[];
}) {
  const [state, formAction, pending] = useActionState<
    ClientJobActionResult | null,
    FormData
  >(createClientJobAction, null);

  const multi = clients.length > 1;
  // Single-client: pin to the sole client so locations show immediately.
  // Multi-client: start empty to force an explicit choice (location disabled until then).
  const [clientId, setClientId] = useState(multi ? "" : (clients[0]?.id ?? ""));
  const visibleLocations = locations.filter((l) => l.clientId === clientId);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {multi && (
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Client</span>
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Location</span>
        <select
          key={clientId}
          name="clientLocationId"
          required
          disabled={!clientId}
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            {clientId ? "Select a location…" : "Select a client first"}
          </option>
          {visibleLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          What&rsquo;s the problem?
        </span>
        <textarea
          name="problemDescription"
          required
          rows={4}
          className={inputClass}
          placeholder="Describe the issue and where it is…"
        />
      </label>

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
        {pending ? "Submitting…" : "Submit work order"}
      </button>
    </form>
  );
}
