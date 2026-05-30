"use client";

import { useActionState } from "react";

type ActionState = { error?: string } | null;

/**
 * Single-button server-action wrapper, parameterized by the bound action and
 * labels. Mirrors SendDispatchButton: a <form action> + submit button with
 * pending state and inline error. The consumer binds the assignment id at the
 * callsite (e.g. acceptDispatchAction.bind(null, id)) so boundAction is a
 * zero-arg thunk; the useActionState (state, formData) args are ignored.
 *
 * Decline is NOT served here (it needs a reason textarea — see VendorDeclineForm).
 *
 * Phase 10 batch 10k-ui.
 */
export function VendorActionButton({
  boundAction,
  label,
  pendingLabel,
}: {
  boundAction: () => Promise<{ error?: string }>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async () => await boundAction(),
    null,
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
