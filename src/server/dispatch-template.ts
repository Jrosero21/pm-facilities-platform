// PURE dispatch-template module — NO "server-only", NO DB/env/IO, so vitest reaches it
// (vitest.config.ts covers the pure modules only). This is the first genuinely testable logic in
// the vendor-WO arc: batches 0 and 1 were schema plus DB-bound accessors.

import { formatMoney } from "@/lib/money";
import { formatAddressOneLine } from "@/lib/address";

// ── vendor-WO batch 2 — TOKEN REGISTRY + RESOLVER ─────────────────────────────────────
//
// ★ SYNTAX: ONE form, {token}, braces only.
// The brief floated @name and {name}. Supporting both would be a standing trap: an operator who
// types @scope in a template that only substitutes {scope} gets a literal "@scope" on a document a
// vendor reads, with nothing to tell them which form was meant. Braces win because '@' occurs
// naturally in the prose these templates carry — email addresses in an "invoice to ap@client.com"
// clause would become accidental tokens — whereas '{' essentially never appears in dispatch
// boilerplate. Matching is CASE-INSENSITIVE so {NTE}, {nte} and {Nte} all resolve; an operator
// should not have to remember casing.
//
// ★ MISSING VALUE → THE TOKEN IS OMITTED, and so is the line it sat on if that leaves the line
// empty. The alternatives are worse on a document a vendor acts from: rendering "[not set]"
// advertises an internal gap to an outside party, and leaving a bare "NTE:" label with nothing
// after it reads as "no limit" rather than "unknown" — a dangerous misreading on the one field
// that caps spend. Silence is the honest rendering of an absent fact.
//
// ★ UNKNOWN TOKEN → LEFT VERBATIM, and reported. An operator typo ({scpoe}) must never crash a
// work order or silently vanish; leaving it visible is what surfaces the mistake, and
// renderDispatchTemplate returns the list so an operator-facing preview can warn while the
// vendor-facing render just carries the text.

/** Everything a token can draw on. All fields nullable — every one is genuinely optional. */
export type DispatchTemplateContext = {
  jobNumber: number | null;
  clientName: string | null;
  siteName: string | null;
  siteAddress: string | null;
  tradeName: string | null;
  priorityName: string | null;
  /** Approved scope when present, else the free-text scope (the createDispatch fallback order). */
  scope: string | null;
  /** Canonical "d.dd" string; formatted by the token, never pre-formatted by the caller. */
  notToExceedAmount: string | null;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  /**
   * ★ A TENANT FACT, NOT A PERSON FACT. users carries no phone column, so this is the
   * aggregator's main number (tenants.phone) — the same number for every coordinator. Named
   * {coordinatorPhone} because that is what it MEANS to the vendor reading it ("the number to
   * call about this job"), while the type keeps the provenance honest.
   */
  coordinatorPhone: string | null;
};

export type DispatchToken = {
  /** Canonical lowercase name, without braces. */
  token: string;
  /** Shown in an operator-facing token reference. */
  description: string;
  resolve: (ctx: DispatchTemplateContext) => string | null;
};

/**
 * THE REGISTRY. Adding a token is one entry here and nothing else — no change to the resolver, no
 * change to the assembler beyond supplying the field. Order is the order an operator-facing help
 * list should show them.
 */
export const DISPATCH_TOKENS: DispatchToken[] = [
  {
    token: "jobnumber",
    description: "The work order number, e.g. 1042",
    resolve: (c) => (c.jobNumber === null ? null : String(c.jobNumber)),
  },
  {
    token: "client",
    description: "Client name",
    resolve: (c) => c.clientName,
  },
  {
    token: "site",
    description: "Site name, e.g. Store 118",
    resolve: (c) => c.siteName,
  },
  {
    token: "siteaddress",
    description: "Full site address on one line",
    resolve: (c) => c.siteAddress,
  },
  {
    token: "trade",
    description: "Trade, e.g. Refrigeration",
    resolve: (c) => c.tradeName,
  },
  {
    token: "priority",
    description: "Priority, e.g. Urgent",
    resolve: (c) => c.priorityName,
  },
  {
    token: "scope",
    description: "Approved scope of work (falls back to the entered scope)",
    resolve: (c) => c.scope,
  },
  {
    token: "nte",
    description: "Not-to-exceed amount, formatted",
    resolve: (c) => (c.notToExceedAmount === null ? null : formatMoney(c.notToExceedAmount)),
  },
  {
    // The operator vocabulary varies by shop; DNE ("do not exceed") is the same figure.
    token: "dne",
    description: "Do-not-exceed amount — an alias of {nte}",
    resolve: (c) => (c.notToExceedAmount === null ? null : formatMoney(c.notToExceedAmount)),
  },
  {
    token: "coordinator",
    description: "The coordinator assigned to this job",
    resolve: (c) => c.coordinatorName,
  },
  {
    token: "coordinatoremail",
    description: "The coordinator's email address",
    resolve: (c) => c.coordinatorEmail,
  },
  {
    token: "coordinatorphone",
    description: "The number to call about this job (the company's main line)",
    resolve: (c) => c.coordinatorPhone,
  },
];

const TOKENS_BY_NAME = new Map(DISPATCH_TOKENS.map((t) => [t.token, t]));

/** Every {word} occurrence. Deliberately narrow: letters/digits/underscore only, so JSON-ish or
 *  brace-using prose in a template is not mistaken for a token. */
const TOKEN_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

export type RenderedDispatchTemplate = {
  /** The substituted text. Empty string when the template resolves to nothing at all. */
  text: string;
  /** Canonical names of tokens that resolved to a value. */
  resolved: string[];
  /** Canonical names of KNOWN tokens whose value was absent — these were removed. */
  missing: string[];
  /** Names found in the template that are not in the registry — these were LEFT VERBATIM. */
  unknown: string[];
};

/**
 * Substitute registry tokens into a raw template.
 *
 * PURE: same input, same output, no clock, no IO. Never throws — a template is operator free text,
 * and a work order must render whatever is there.
 *
 * Line handling: a line that contained at least one token and is left blank/punctuation-only after
 * substitution is DROPPED. That is what turns a "NTE: {nte}" line into nothing when there is no
 * NTE, rather than a dangling label. Lines that never held a token are preserved exactly, blank
 * ones included, so an operator's paragraph breaks survive.
 */
export function renderDispatchTemplate(
  rawTemplate: string | null,
  ctx: DispatchTemplateContext,
): RenderedDispatchTemplate {
  if (rawTemplate === null || rawTemplate.trim() === "") {
    return { text: "", resolved: [], missing: [], unknown: [] };
  }

  const resolved = new Set<string>();
  const missing = new Set<string>();
  const unknown = new Set<string>();

  const outLines: string[] = [];
  for (const line of rawTemplate.split("\n")) {
    let knownOnLine = 0;
    let filledOnLine = 0;
    const substituted = line.replace(TOKEN_PATTERN, (whole, rawName: string) => {
      const name = rawName.toLowerCase();
      const entry = TOKENS_BY_NAME.get(name);
      if (!entry) {
        unknown.add(rawName); // reported as typed, so an operator recognises their typo
        return whole; // left verbatim — never silently dropped
      }
      knownOnLine++;
      const value = entry.resolve(ctx);
      const usable = value === null ? null : value.trim();
      if (usable === null || usable === "") {
        missing.add(name);
        return "";
      }
      filledOnLine++;
      resolved.add(name);
      return usable;
    });

    // ★ DROP A LINE WHOSE TOKENS ALL WENT MISSING — label included.
    // A line exists to carry its tokens; when none of them resolved, its remaining text is a label
    // for a fact we do not have. "NTE: {nte}" with no NTE must vanish entirely, because a bare
    // "NTE:" reads to a vendor as "no limit" rather than "unknown" — the dangerous misreading on
    // the one field that caps spend. A line where SOME tokens resolved is kept: it still carries
    // real content, and dropping it would discard facts we do have.
    if (knownOnLine > 0 && filledOnLine === 0) continue;
    outLines.push(substituted);
  }

  return {
    text: outLines.join("\n").trim(),
    resolved: [...resolved].sort(),
    missing: [...missing].sort(),
    unknown: [...unknown].sort(),
  };
}

/**
 * ★ WHICH NTE A TEMPLATE MEANS. Pure, and extracted here rather than left inline in the DB
 * assembler so the precedence is unit-testable — the rule is the fix, and a rule nothing asserts
 * is a rule that silently regresses.
 *
 * On a work order "the NTE" is the ASSIGNMENT's agreed ceiling: the figure this vendor accepted,
 * and the same one the PDF's NTE box prints. The job's not_to_exceed_amount is the internal
 * authorisation and answers only when no assignment is in scope (a job-level preview before any
 * dispatch exists). Reading the job's value while an assignment existed is what let a template say
 * "NTE: " blank — or worse, a DIFFERENT number — beside a box showing the real ceiling.
 */
export function resolveTemplateNte(
  assignmentAgreedNte: string | null | undefined,
  jobNotToExceed: string | null | undefined,
): string | null {
  return assignmentAgreedNte ?? jobNotToExceed ?? null;
}

// ── PARTIAL-LINE LIMITATION (accepted, documented, deliberately not parsed) ───────────
// A token that resolves EMPTY *mid-line* can leave a dangling connective — "contact {coordinator}
// at {coordinatoremail} or {coordinatorphone}." renders as "...at a@b or ." when no phone exists.
// The line-drop rule above does not catch it, by design: some tokens on that line DID resolve, so
// the line still carries real facts and must not be discarded.
//
// NOT FIXED BY A PARSER, deliberately. Trimming a trailing "or"/"and" plus orphaned punctuation
// would be English-only, end-of-line-only, and would have to be right about prose it cannot see —
// more machinery than a rare cosmetic case justifies, and a new rule that can itself be wrong.
//
// MITIGATED INSTEAD BY DATA: the case only arises when a referenced value is absent, so keeping
// tenants.phone populated (prod is; local now matches) removes it in practice. Template authors
// can also structure contact lines to tolerate an absent value — put each contact method on its
// own line, and the existing line-drop rule handles it cleanly.

/** Build the one-line site address from location parts. Exported so the assembler and any future
 *  caller format it identically (it is the shared formatter, not a local variant). */
export function siteAddressLine(parts: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
}): string | null {
  const line = formatAddressOneLine(parts);
  return line.trim() === "" ? null : line;
}
