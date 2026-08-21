"use client";

import { useActionState, useState } from "react";
import {
  recordVendorPresenceAction,
  type PresenceState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

// ── FOUNDATION Gap 1 — RECORD VENDOR UPDATE (operator form) ───────────────────────────
// Mirrors G2's log-a-call panel: collapsed behind a button, because the assignment workspace is a
// reading surface and a permanently-open form pushes the facts an operator came to check below the
// fold. Same copy discipline too — this records what the vendor SAID, it does not act.
//
// One form, three modes. The mode changes which fields show, so the operator picks "what am I
// recording?" in plain language rather than choosing between three near-identical forms.

type Mode = "eta" | "check_in" | "check_out";

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: "eta", label: "ETA — they told me when they're coming", help: "When the vendor says they'll arrive." },
  { value: "check_in", label: "Check-in — they've arrived", help: "When the vendor actually arrived on site." },
  { value: "check_out", label: "Check-out — they've left", help: "When the vendor left site." },
];

export function RecordVendorPresence({
  jobId,
  assignmentId,
}: {
  jobId: string;
  assignmentId: string;
}) {
  const action = recordVendorPresenceAction.bind(null, jobId, assignmentId);
  const [state, formAction, pending] = useActionState<PresenceState, FormData>(action, null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("eta");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        Record vendor update
      </button>
    );
  }

  const active = MODES.find((m) => m.value === mode)!;
  const isEta = mode === "eta";

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Record vendor update</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        Record what the vendor told you — this does not change the dispatch status. Use the status
        picker above for that.
      </p>

      <input type="hidden" name="kind" value={mode} />

      <label className="block text-sm">
        <span className="text-neutral-700">What are you recording?</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-neutral-500">{active.help}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-700">
            {isEta ? "Expected arrival" : "When (blank = now)"}
          </span>
          <input
            type="datetime-local"
            name="occurredAt"
            required={isEta}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>

        {isEta && (
          <label className="block text-sm">
            <span className="text-neutral-700">Window end (optional)</span>
            <input
              type="datetime-local"
              name="etaEndAt"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
        )}
      </div>

      {/* ★ The one control that changes something other than the presence log. Opt-in by design:
          noting what the vendor said and changing what we have committed to are different acts. */}
      {isEta && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="updateSchedule" className="mt-0.5" />
          <span>
            <span className="text-neutral-800">Also update the scheduled time</span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              Changes the dispatch&apos;s scheduled start — this is what the work order prints.
            </span>
          </span>
        </label>
      )}

      <label className="block text-sm">
        <span className="text-neutral-700">Note (optional)</span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          placeholder="Tech called — running behind on a prior job, now expects 4pm."
        />
      </label>

      {state?.info && (
        <p role="status" className="text-xs text-neutral-600">
          {state.info}
        </p>
      )}
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
        {pending ? "Saving…" : "Record"}
      </button>
    </form>
  );
}
