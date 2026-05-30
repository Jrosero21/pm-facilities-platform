"use client";

import { useActionState } from "react";
import { confirmEtaAction } from "@/app/(vendor)/vendor/jobs/actions";

type ActionState = { error?: string } | null;

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

/**
 * ETA confirmation form. Submits via confirmEtaAction(assignmentId, etaStartAt,
 * etaEndAt?, note?). Per DoR-10k.3 this transitions ACCEPTED → SCHEDULED in one
 * transaction (the ETA IS the scheduling act). Native input[type=datetime-local]
 * per Fork 4 ruling (no date library); inputClass mirrors new-dispatch-form.
 *
 * Phase 10 batch 10k-ui.
 */
export function VendorEtaForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (_prev, formData) => {
      const start = formData.get("etaStartAt");
      const end = formData.get("etaEndAt");
      const note = formData.get("note");
      return await confirmEtaAction(
        assignmentId,
        typeof start === "string" ? start : "",
        typeof end === "string" && end.length > 0 ? end : undefined,
        typeof note === "string" && note.length > 0 ? note : undefined,
      );
    },
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-3">
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          ETA start (required)
        </label>
        <input
          type="datetime-local"
          name="etaStartAt"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          ETA end (optional)
        </label>
        <input type="datetime-local" name="etaEndAt" className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Note (optional)
        </label>
        <textarea name="note" rows={2} className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Confirm ETA"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
