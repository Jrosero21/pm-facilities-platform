// Note/communication visibility vocabulary + badge. Shared (no directive — importable
// by both server components and client components / actions): the note form's picker
// options, the job-detail Notes badge, and — forward — the communication log, the rich
// timeline (6c), and the Phase 10/11 portals.
//
// PALETTE NOTE (R-6.x, documented at 6h): this palette is visibility-LOCAL (audience
// classification). It intentionally aligns with the status palette (R-5.13, workflow
// lifecycle) on amber = "operator-action-blocking" (requires_review here ≈ pending
// there). blue/green/teal are palette-local — they carry no cross-palette meaning.

export type NoteVisibility =
  | "internal_only"
  | "vendor_visible"
  | "client_visible"
  | "client_and_vendor_visible"
  | "requires_review";

export const NOTE_VISIBILITY_VALUES: readonly NoteVisibility[] = [
  "internal_only",
  "vendor_visible",
  "client_visible",
  "client_and_vendor_visible",
  "requires_review",
];

const VISIBILITY_META: Record<NoteVisibility, { label: string; badge: string }> = {
  internal_only: { label: "Internal only", badge: "bg-neutral-100 text-neutral-700" },
  vendor_visible: { label: "Vendor-visible", badge: "bg-blue-100 text-blue-800" },
  client_visible: { label: "Client-visible", badge: "bg-green-100 text-green-800" },
  client_and_vendor_visible: { label: "Client + vendor", badge: "bg-teal-100 text-teal-800" },
  requires_review: { label: "Requires review", badge: "bg-amber-100 text-amber-800" },
};

/** {value,label} pairs for a visibility <select>, in canonical order. */
export const NOTE_VISIBILITY_OPTIONS = NOTE_VISIBILITY_VALUES.map((v) => ({
  value: v,
  label: VISIBILITY_META[v].label,
}));

/** Runtime guard for untrusted input (formData). */
export function isNoteVisibility(v: string): v is NoteVisibility {
  return (NOTE_VISIBILITY_VALUES as readonly string[]).includes(v);
}

export function noteVisibilityLabel(v: string): string {
  return VISIBILITY_META[v as NoteVisibility]?.label ?? v;
}

export function NoteVisibilityBadge({ visibility }: { visibility: string }) {
  const meta = VISIBILITY_META[visibility as NoteVisibility] ?? VISIBILITY_META.internal_only;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

// Phase 10 batch 10l — vendor-origin tag. Renders ONLY for origin='vendor'
// (operator is the implicit default — no badge). Subtle neutral pill: this is
// an authorship/provenance axis, deliberately quieter than the colored
// visibility palette so it doesn't read as a visibility classification.
export type NoteOrigin = "operator" | "vendor";

export function NoteOriginBadge({ origin }: { origin: string }) {
  if (origin !== "vendor") return null;
  return (
    <span className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600">
      Vendor
    </span>
  );
}
