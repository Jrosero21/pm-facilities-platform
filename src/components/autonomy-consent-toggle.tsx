"use client";

import { useActionState } from "react";
import { setClientAutonomyConsentAction, type ClientAutonomyConsentState } from "@/app/(app)/clients/actions";

// Phase 28 — per-client autonomy consent. OPT-IN (default off): while off, the aggregator's
// autonomous paths never act on this client's jobs (they draft for operator review instead).
// Mirrors PriorityClientToggle. must-notify-client is a separate flag (send not yet wired).
export function AutonomyConsentToggle({ clientId, current }: { clientId: string; current: boolean }) {
  const action = setClientAutonomyConsentAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ClientAutonomyConsentState, FormData>(action, null);

  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-start gap-2">
      <label className="flex max-w-2xl items-start gap-2">
        <input type="checkbox" name="value" value="true" defaultChecked={current} className="mt-0.5" />
        <span>
          <span className="text-sm font-medium text-neutral-800">Autonomy allowed</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            When on, the platform may act on this client&apos;s jobs autonomously (e.g. auto re-dispatch),
            still subject to your tenant autonomy setting and all guardrails. Off means every autonomous
            action is held for operator review.
          </span>
        </span>
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
    </form>
  );
}
