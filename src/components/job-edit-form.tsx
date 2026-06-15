"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateJobAction, type UpdateJobState } from "@/app/(app)/jobs/actions";
import { toLocalInputValue } from "@/lib/datetime";
import { FOLLOW_UP_CATEGORIES, FOLLOW_UP_CATEGORY_LABELS, type FollowUpCategory } from "@/lib/follow-up";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// MUST match the server gate in updateJob (OPERATOR_DESCRIPTION_SOURCES). For any other source the
// problem_description came from the client/an external requester → render read-only (disabled =
// never submitted); the server PROBLEM_DESCRIPTION_LOCKED guard is the backstop.
const DESCRIPTION_EDITABLE_SOURCES = new Set(["manual", "preventative_maintenance", "snow_event"]);

type Option = { id: string; name: string };
type LocationOption = { id: string; clientId: string; name: string };

export type JobEditCurrent = {
  clientId: string;
  clientLocationId: string;
  primaryTradeId: string | null;
  priorityId: string | null;
  notToExceedAmount: string | null;
  problemDescription: string;
  scopeOfWork: string | null;
  followUpAt: Date | null;
  followUpCategory: FollowUpCategory | null;
};

export function JobEditForm({
  jobId,
  sourceType,
  current,
  clients,
  locations,
  trades,
  priorities,
  hasActiveAssignment,
}: {
  jobId: string;
  sourceType: string;
  current: JobEditCurrent;
  clients: Option[];
  locations: LocationOption[];
  trades: Option[];
  priorities: Option[];
  hasActiveAssignment: boolean;
}) {
  const [state, formAction, pending] = useActionState<UpdateJobState, FormData>(
    updateJobAction.bind(null, jobId),
    null,
  );

  // client_id is IMMUTABLE — no client selector. The location list is fixed to the job's client.
  const clientName = clients.find((c) => c.id === current.clientId)?.name ?? "—";
  const visibleLocations = locations.filter((l) => l.clientId === current.clientId);
  const descEditable = DESCRIPTION_EDITABLE_SOURCES.has(sourceType);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {/* client — read-only (immutable) */}
      <div className="block">
        <span className="text-sm font-medium text-neutral-800">Client</span>
        <p className="mt-1 text-sm text-neutral-600">{clientName} <span className="text-neutral-400">(not editable)</span></p>
      </div>

      {hasActiveAssignment && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          A vendor is already dispatched for this job. Changing the trade or location may leave that assignment mismatched.
        </p>
      )}

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Trade</span>
        <select name="primaryTradeId" required defaultValue={current.primaryTradeId ?? ""} className={inputClass}>
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
        <select name="priorityId" required defaultValue={current.priorityId ?? ""} className={inputClass}>
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
        <span className="text-sm font-medium text-neutral-800">Location</span>
        <select name="clientLocationId" required defaultValue={current.clientLocationId} className={inputClass}>
          {visibleLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Not-to-exceed <span className="font-normal text-neutral-500">(optional — leave blank to keep unchanged)</span>
        </span>
        <input
          name="notToExceedAmount"
          inputMode="decimal"
          defaultValue={current.notToExceedAmount ?? ""}
          placeholder="e.g. 1500.00"
          className={inputClass}
        />
      </label>

      {/* Follow-up (next action). Both inputs are optional; the server enforces the pairing
          (a date requires a type) and treats a blank date as an explicit CLEAR of both. */}
      <div className="block">
        <span className="text-sm font-medium text-neutral-800">
          Follow-up (next action) <span className="font-normal text-neutral-500">(optional — clear the date to remove)</span>
        </span>
        <input
          type="datetime-local"
          name="followUpAt"
          defaultValue={toLocalInputValue(current.followUpAt)}
          className={inputClass}
        />
        <select name="followUpCategory" defaultValue={current.followUpCategory ?? ""} className={inputClass}>
          <option value="">No follow-up type</option>
          {FOLLOW_UP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FOLLOW_UP_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="block">
        <span className="text-sm font-medium text-neutral-800">Problem description</span>
        {descEditable ? (
          <textarea name="problemDescription" required rows={4} defaultValue={current.problemDescription} className={inputClass} />
        ) : (
          <>
            <textarea
              rows={4}
              defaultValue={current.problemDescription}
              disabled
              className={`${inputClass} cursor-not-allowed bg-neutral-50 text-neutral-500`}
            />
            <p className="mt-1 text-xs text-neutral-500">From the client — not editable.</p>
          </>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Scope of work <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea name="scopeOfWork" rows={3} defaultValue={current.scopeOfWork ?? ""} className={inputClass} />
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
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/jobs/${jobId}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
