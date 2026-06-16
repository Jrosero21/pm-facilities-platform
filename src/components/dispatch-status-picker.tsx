"use client";

import { useActionState } from "react";
import {
  setAssignmentStatusAction,
  type SetStatusState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type StatusOption = { code: string; name: string };

// Operator hand-advance picker — the coordinator sets a dispatch's status when a vendor calls/texts
// in. Mirrors SendDispatchButton (useActionState form, pending-disabled, inline state). Options are
// passed in from the server page (already filtered to exclude DRAFT/SENT + the current status); the
// server backstops the DRAFT/SENT guard regardless.
export function DispatchStatusPicker({
  assignmentId,
  options,
}: {
  assignmentId: string;
  options: StatusOption[];
}) {
  const action = setAssignmentStatusAction.bind(null, assignmentId);
  const [state, formAction, pending] = useActionState<SetStatusState, FormData>(action, null);

  if (options.length === 0) return null;

  return (
    <form action={formAction} className="space-y-2">
      <label className="block text-sm font-medium text-neutral-800">
        Set status
        <span className="font-normal text-neutral-500"> (e.g. when a vendor calls it in)</span>
        <select name="toCode" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            Choose a status…
          </option>
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
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update status"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.info && <p className="text-sm text-emerald-700">{state.info}</p>}
    </form>
  );
}
