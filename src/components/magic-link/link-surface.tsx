"use client";

import { useActionState } from "react";
import {
  acceptLinkAction,
  declineLinkAction,
  confirmEtaLinkAction,
  confirmScheduleLinkAction,
  markOnSiteLinkAction,
  markWorkCompleteLinkAction,
  addNoteLinkAction,
  uploadPhotoLinkAction,
  type LinkActionState,
} from "@/app/link/[token]/actions";

// Phase 21 — the linkless action forms. Each form binds the RAW TOKEN as the first arg; the
// server action re-resolves it (the token is the only trusted input). The right status controls
// render per statusCode; notes + photo upload are always available. Invoice is not offered.

type Bound = (prev: LinkActionState, formData: FormData) => Promise<LinkActionState>;

export function LinkSurface({ token, statusCode }: { token: string; statusCode: string }) {
  return (
    <div className="space-y-6">
      <StatusControls token={token} statusCode={statusCode} />
      <AddNoteForm token={token} />
      <UploadPhotoForm token={token} />
    </div>
  );
}

function StatusControls({ token, statusCode }: { token: string; statusCode: string }) {
  switch (statusCode) {
    case "SENT":
      return (
        <section className="space-y-3">
          <SubmitButton label="Accept job" action={acceptLinkAction.bind(null, token)} />
          <DeclineForm token={token} />
        </section>
      );
    case "ACCEPTED":
      return <ConfirmEtaForm token={token} />;
    case "SCHEDULED":
      return <SubmitButton label="Confirm scheduled visit" action={confirmScheduleLinkAction.bind(null, token)} />;
    case "CONFIRMED":
      return <SubmitButton label="Mark on site" action={markOnSiteLinkAction.bind(null, token)} />;
    case "ON_SITE":
      return <SubmitButton label="Mark work complete" action={markWorkCompleteLinkAction.bind(null, token)} />;
    default:
      return <p className="text-sm text-neutral-500">No status actions are available right now.</p>;
  }
}

function SubmitButton({ label, action }: { label: string; action: Bound }) {
  const [state, formAction, pending] = useActionState<LinkActionState, FormData>(action, null);
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "…" : label}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

function DeclineForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<LinkActionState, FormData>(
    declineLinkAction.bind(null, token),
    null,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="reason"
        placeholder="Reason to decline (optional)…"
        className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "…" : "Decline"}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

function ConfirmEtaForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<LinkActionState, FormData>(
    confirmEtaLinkAction.bind(null, token),
    null,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-medium text-neutral-700">
        ETA
        <input
          type="datetime-local"
          name="etaStartAt"
          required
          className="mt-1 block rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "…" : "Confirm ETA"}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

function AddNoteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<LinkActionState, FormData>(
    addNoteLinkAction.bind(null, token),
    null,
  );
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Add a note</h2>
      <form action={formAction} className="mt-2 space-y-2">
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Update for the work order…"
          className="block w-full rounded border border-neutral-300 p-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "…" : "Add note"}
        </button>
        <ErrorText state={state} />
      </form>
    </section>
  );
}

function UploadPhotoForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<LinkActionState, FormData>(
    uploadPhotoLinkAction.bind(null, token),
    null,
  );
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Add a photo</h2>
      <form action={formAction} className="mt-2 space-y-2">
        <input
          type="text"
          name="title"
          required
          maxLength={255}
          placeholder="Photo title (e.g. nameplate before service)"
          className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          type="file"
          name="file"
          accept="image/*"
          capture="environment"
          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
        />
        <p className="text-xs text-neutral-500">JPG, PNG, WEBP, or HEIC up to 15 MB. A title with no file records a placeholder.</p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "…" : "Attach photo"}
        </button>
        <ErrorText state={state} />
      </form>
    </section>
  );
}

function ErrorText({ state }: { state: LinkActionState }) {
  if (!state?.error) return null;
  return (
    <span role="alert" className="ml-2 text-xs text-red-600">
      {state.error}
    </span>
  );
}
