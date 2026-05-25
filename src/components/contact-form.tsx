"use client";

import { useActionState } from "react";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// Shared action-state contract for the contact form. Owned here (the neutral,
// domain-agnostic component) so any domain's contact action — client, vendor,
// and later jobs — can conform without importing from another domain's folder.
export type ContactActionState = { error: string } | null;

type ContactAction = (
  prev: ContactActionState,
  formData: FormData,
) => Promise<ContactActionState>;

export function ContactForm({
  action,
  submitLabel = "Add contact",
}: {
  action: ContactAction;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Name</span>
          <input name="name" required autoComplete="off" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Title <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="title" autoComplete="off" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Email <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="email" type="email" autoComplete="off" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Phone <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="phone" autoComplete="off" className={inputClass} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <input name="isPrimary" type="checkbox" className="rounded border-neutral-300" />
        Primary contact
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Notes <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea name="notes" rows={2} className={inputClass} />
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
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
