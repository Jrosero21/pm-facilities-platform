// Dispatch status badge — category-colored (CHANGE 3 / 05-system-workflows.md).
// Colors carry SEMANTIC meaning, not decoration: amber = sent/awaiting-vendor
// (operator may need to nudge), blue = vendor engaged, green = done, red =
// terminated (declined or cancelled), neutral = draft (operator workspace, not
// yet vendor-facing). Same palette everywhere — do not vary per page.

const CATEGORY_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  pending: "bg-amber-100 text-amber-800",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export function DispatchStatusBadge({
  category,
  label,
}: {
  category: string;
  label: string;
}) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.draft;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
