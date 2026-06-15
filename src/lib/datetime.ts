// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Datetime helpers shared
// across the server actions (parse a datetime-local string) and the client forms (render a Date
// back into a datetime-local input value). Mirrors the module-local parseDateTime in the
// new-dispatch action, lifted here so jobs/actions.ts reuses it (a sync helper cannot be exported
// from a "use server" file — pnpm build enforces that).

/** datetime-local string → Date, or null when blank/invalid. (new Date over a local "YYYY-MM-DDTHH:mm".) */
export function parseDateTime(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date → the value a <input type="datetime-local"> expects: "YYYY-MM-DDTHH:mm" in LOCAL time.
 * Uses the local getters (NOT toISOString, which would shift by the UTC offset and show the wrong
 * wall-clock time). Empty string for null.
 */
export function toLocalInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
