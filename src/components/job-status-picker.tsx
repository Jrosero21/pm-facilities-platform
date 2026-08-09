"use client";

import { useActionState } from "react";
import {
  setJobStatusAction,
  type SetJobStatusState,
} from "@/app/(app)/jobs/actions";

const selectClass =
  "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type StatusOption = { code: string; name: string };

// Inline job-status quick-edit — the operator changes status right on the job detail, no round-trip
// to the Edit form. Free movement (any status); the current status is preselected. Mirrors
// DispatchStatusPicker. `options` come from the server page (all job statuses); setJobStatus no-ops
// a same-status pick. On success the page revalidates and re-renders with the new status.
export function JobStatusPicker({
  jobId,
  currentCode,
  options,
}: {
  jobId: string;
  currentCode: string;
  options: StatusOption[];
}) {
  const action = setJobStatusAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<SetJobStatusState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        Status
        <select name="toCode" defaultValue={currentCode} className={selectClass}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
      {state?.info && <span className="text-xs text-neutral-500">{state.info}</span>}
    </form>
  );
}
