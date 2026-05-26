// Agent-confidence badge (rewriter decision). Shared (no directive). Semantic palette,
// aligned with the visibility/status families: high=green, medium=blue, low=amber.
const META: Record<string, { label: string; badge: string }> = {
  high: { label: "High confidence", badge: "bg-green-100 text-green-800" },
  medium: { label: "Medium confidence", badge: "bg-blue-100 text-blue-800" },
  low: { label: "Low confidence", badge: "bg-amber-100 text-amber-800" },
};

export function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;
  const m = META[confidence] ?? { label: confidence, badge: "bg-neutral-100 text-neutral-700" };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${m.badge}`}>{m.label}</span>;
}
