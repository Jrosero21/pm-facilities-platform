"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createDispatchAction,
  type CreateDispatchState,
} from "@/app/(app)/jobs/[id]/dispatch/new/actions";
import { facetLine } from "@/components/dispatch-facets";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export type DispatchCandidate = {
  vendorId: string;
  vendorName: string;
  vendorType: string;
  primaryTradeMatch: boolean;
  tightestGeoMatch: string;
  complianceStatus: string;
  locations: { id: string; name: string }[];
  contacts: { id: string; name: string; isPrimary: boolean }[];
};

export function NewDispatchForm({
  jobId,
  tradeName,
  candidates,
  defaultScope,
  defaultScheduledStart,
}: {
  jobId: string;
  tradeName: string;
  candidates: DispatchCandidate[];
  defaultScope: string;
  defaultScheduledStart: string;
}) {
  const action = createDispatchAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<CreateDispatchState, FormData>(
    action,
    null,
  );

  // Pre-select the best/only candidate (the matcher ranks best-first). CHANGE 2:
  // every blank field is a decision; pre-fill the obvious ones.
  const [selectedVendorId, setSelectedVendorId] = useState(
    candidates[0]?.vendorId ?? "",
  );
  const selected = candidates.find((c) => c.vendorId === selectedVendorId);
  const branches = selected?.locations ?? [];
  const contacts = selected?.contacts ?? [];
  const defaultBranch = branches[0]?.id ?? "";
  const defaultContact =
    contacts.find((c) => c.isPrimary)?.id ?? contacts[0]?.id ?? "";
  const single = candidates.length === 1;

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      {/* --- vendor picker --- */}
      <div>
        <span className="text-sm font-medium text-neutral-800">
          Vendor{" "}
          <span className="font-normal text-neutral-500">
            ({candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} matched)
          </span>
        </span>

        {single ? (
          <>
            <input type="hidden" name="vendorId" value={selectedVendorId} />
            <div className="mt-1 rounded-md border border-neutral-300 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-900">
                  {candidates[0].vendorName}
                </span>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {candidates[0].vendorType}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                {facetLine({
                  tradeName,
                  primaryTradeMatch: candidates[0].primaryTradeMatch,
                  tightestGeo: candidates[0].tightestGeoMatch,
                  compliance: candidates[0].complianceStatus,
                })}
              </p>
            </div>
          </>
        ) : (
          <div className="mt-1 space-y-2">
            {candidates.map((c) => (
              <label
                key={c.vendorId}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                  c.vendorId === selectedVendorId
                    ? "border-neutral-900 bg-neutral-50"
                    : "border-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="vendorId"
                  value={c.vendorId}
                  checked={c.vendorId === selectedVendorId}
                  onChange={() => setSelectedVendorId(c.vendorId)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">
                      {c.vendorName}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-neutral-500">
                      {c.vendorType}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {facetLine({
                      tradeName,
                      primaryTradeMatch: c.primaryTradeMatch,
                      tightestGeo: c.tightestGeoMatch,
                      compliance: c.complianceStatus,
                    })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* --- branch (vendor location), dependent on selected vendor (R-4.12) --- */}
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Branch{" "}
          <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        {branches.length === 0 ? (
          <>
            <input type="hidden" name="vendorLocationId" value="" />
            <p className="mt-1 text-sm text-neutral-500">
              No branches — dispatched vendor-wide.
            </p>
          </>
        ) : (
          <select
            key={selectedVendorId}
            name="vendorLocationId"
            defaultValue={defaultBranch}
            className={inputClass}
          >
            <option value="">(No specific branch — vendor-wide)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </label>

      {/* --- contact (POC), dependent on selected vendor (R-4.12) --- */}
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Coordination contact{" "}
          <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        {contacts.length === 0 ? (
          <>
            <input type="hidden" name="vendorContactId" value="" />
            <p className="mt-1 text-sm text-neutral-500">No contacts on file.</p>
          </>
        ) : (
          <select
            key={selectedVendorId}
            name="vendorContactId"
            defaultValue={defaultContact}
            className={inputClass}
          >
            <option value="">(No contact)</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isPrimary ? " (primary)" : ""}
              </option>
            ))}
          </select>
        )}
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Scheduled start</span>
          <input
            type="datetime-local"
            name="scheduledStartAt"
            defaultValue={defaultScheduledStart}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Scheduled end <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input type="datetime-local" name="scheduledEndAt" className={inputClass} />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Agreed NTE <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input
          type="number"
          name="agreedNteAmount"
          step="0.01"
          min="0"
          placeholder="0.00"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Scope{" "}
          <span className="font-normal text-neutral-500">
            (pre-filled from the job — edit as needed)
          </span>
        </span>
        <textarea
          name="dispatchScope"
          rows={4}
          defaultValue={defaultScope}
          className={inputClass}
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !selectedVendorId}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create dispatch"}
        </button>
        <Link
          href={`/jobs/${jobId}`}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
