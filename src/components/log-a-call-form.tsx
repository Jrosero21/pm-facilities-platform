"use client";

import { timeZoneAbbreviation } from "@/lib/format-date";
import { useActionState, useState } from "react";
import { logContactAction, type LogContactState } from "@/app/(app)/jobs/contact-log-actions";

// ── G2 — LOG A CALL (operator form) ───────────────────────────────────────────────────
// Records a phone call that already happened. Deliberately NOT a send form: there is no
// recipient email, no "send" button, and no draft state — the operator is writing history, and
// the copy says so ("Record a call that already happened").
//
// Collapsed by default. The Communications section is a reading surface; a permanently-open form
// would push the log the operator came to read below the fold.

export type CallContactOption = { id: string; name: string; party: "client" | "vendor" };

export function LogACallForm({
  jobId,
  contacts,
  siteTimeZone,
}: {
  jobId: string;
  contacts: CallContactOption[];
  /** The site's IANA zone — the basis contact-log-actions parses in. */
  siteTimeZone: string;
}) {
  const action = logContactAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<LogContactState, FormData>(action, null);
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState<"client" | "vendor">("client");

  // The contact list narrows with the party toggle, so a client contact can never be submitted
  // as a vendor one. The server re-checks anyway (CONTACT_NOT_IN_PARTY) — this is the affordance,
  // not the guard.
  const visible = contacts.filter((c) => c.party === party);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        Log a call
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Log a call</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        Record a call that already happened. Nothing is sent — this is a record for the job history.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-700">Direction</span>
          <select
            name="direction"
            defaultValue="outbound"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="outbound">We called them</option>
            <option value="inbound">They called us</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-neutral-700">Party</span>
          <select
            name="party"
            value={party}
            onChange={(e) => setParty(e.target.value === "vendor" ? "vendor" : "client")}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="client">Client</option>
            <option value="vendor">Vendor</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-neutral-700">Who (optional)</span>
          <select
            name="contactId"
            defaultValue=""
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">Not recorded</option>
            {visible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-neutral-700">
            When (blank = now){" "}
            <span className="text-neutral-500">
              ({timeZoneAbbreviation(siteTimeZone)} — site time)
            </span>
          </span>
          <input
            type="datetime-local"
            name="occurredAt"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-neutral-700">What was discussed</span>
        <textarea
          name="notes"
          rows={3}
          required
          maxLength={5000}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          placeholder="Confirmed the tech is arriving Thursday morning; client asked for a call ahead of arrival."
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save call log"}
      </button>
    </form>
  );
}
