"use client";

import { useActionState } from "react";
import { declineDispatchAction } from "@/app/(vendor)/vendor/jobs/actions";

type ActionState = { error?: string } | null;

/**
 * Decline-with-reason form. Submits via declineDispatchAction(assignmentId,
 * reason). Reason is optional; lands in history.note per Fork 2 ruling.
 * Secondary/destructive button styling (bordered, white) since decline is
 * terminal.
 *
 * Phase 10 batch 10k-ui.
 */
export function VendorDeclineForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (_prev, formData) => {
      const reason = formData.get("reason");
      return await declineDispatchAction(
        assignmentId,
        typeof reason === "string" && reason.length > 0 ? reason : undefined,
      );
    },
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-2">
      <label className="block text-sm font-medium text-neutral-700">
        Decline reason (optional)
      </label>
      <textarea
        name="reason"
        rows={3}
        className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Declining…" : "Decline"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
