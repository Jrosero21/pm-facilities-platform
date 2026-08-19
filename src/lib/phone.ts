// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO.

const EM_DASH = "—";

/**
 * Format a stored phone number for display.
 *
 * - If the input ends with an optional extension (x or X + digits, or the word "ext" + digits),
 *   remove that extension before formatting the main number.
 * - Take only the remaining digits.
 * - If exactly 10 digits: format as (555) 123-4567
 * - If exactly 11 digits and the first is 1: format as +1 (555) 123-4567
 * - Otherwise: return the original input trimmed (never mangled).
 * - If a recognized extension exists: append " x" + extension digits to the formatted number.
 */
export function formatPhone(input: string | null | undefined): string {
  if (input === null || input === undefined) return EM_DASH;

  const originalTrimmed = input.trim();
  if (originalTrimmed === "") return EM_DASH;

  // Capture an optional trailing extension.
  // Examples:
  //   "5551234567 x89"
  //   "555-123-4567 ext 200"
  //   "5551234567X89" (also allowed)
  const extMatch = originalTrimmed.match(/^(.*?)(?:\s*(?:x|ext)\s*([0-9]+))\s*$/i);

  const mainPart = extMatch ? extMatch[1].trimEnd() : originalTrimmed;
  const extDigits = extMatch ? extMatch[2] : null;

  // Keep only digits from the main part.
  const mainDigits = mainPart.replace(/[^0-9]/g, "");

  let formatted: string | null = null;

  if (mainDigits.length === 10) {
    const a = mainDigits.slice(0, 3);
    const b = mainDigits.slice(3, 6);
    const c = mainDigits.slice(6, 10);
    formatted = `(${a}) ${b}-${c}`;
  } else if (mainDigits.length === 11 && mainDigits[0] === "1") {
    const a = mainDigits.slice(1, 4);
    const b = mainDigits.slice(4, 7);
    const c = mainDigits.slice(7, 11);
    formatted = `+1 (${a}) ${b}-${c}`;
  }

  if (!formatted) {
    // Not conforming: return original trimmed and otherwise unchanged.
    return originalTrimmed;
  }

  if (extDigits) {
    return `${formatted} x${extDigits}`;
  }

  return formatted;
}
