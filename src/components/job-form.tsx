"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createJobAction, type CreateJobState } from "@/app/(app)/jobs/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type Option = { id: string; name: string };
type LocationOption = { id: string; clientId: string; name: string };

export function JobForm({
  clients,
  locations,
  trades,
  priorities,
}: {
  clients: Option[];
  locations: LocationOption[];
  trades: Option[];
  priorities: Option[];
}) {
  const [state, formAction, pending] = useActionState<CreateJobState, FormData>(
    createJobAction,
    null,
  );
  // Drives the client-side location filter (option d — no fetch; all locations
  // ship with the page). The location <select> is keyed by clientId so it
  // remounts (resetting to its placeholder) whenever the client changes.
  const [clientId, setClientId] = useState("");
  const visibleLocations = locations.filter((l) => l.clientId === clientId);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
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
        <span className="text-sm font-medium text-neutral-800">Trade</span>
        <select name="primaryTradeId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select a trade…
          </option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Priority</span>
        <select name="priorityId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select a priority…
          </option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Problem description</span>
        <textarea
          name="problemDescription"
          required
          rows={4}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Initial scope <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea name="scopeOfWork" rows={3} className={inputClass} />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create job"}
        </button>
        <Link href="/jobs" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
