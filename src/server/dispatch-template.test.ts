import { describe, expect, it } from "vitest";
import {
  DISPATCH_TOKENS,
  renderDispatchTemplate,
  resolveTemplateNte,
  siteAddressLine,
  type DispatchTemplateContext,
} from "@/server/dispatch-template";

const FULL: DispatchTemplateContext = {
  jobNumber: 1042,
  clientName: "Acme Retail Co",
  siteName: "SF Downtown Store",
  siteAddress: "123 Market St, San Francisco, CA 94103",
  tradeName: "Refrigeration",
  priorityName: "Urgent",
  scope: "Diagnose walk-in cooler and restore operation.",
  notToExceedAmount: "750.00",
  coordinatorName: "Jonny Rosero",
  coordinatorEmail: "ops@rose-analytics.com",
  coordinatorPhone: "+1 555 010 2030",
};

const EMPTY: DispatchTemplateContext = {
  jobNumber: null,
  clientName: null,
  siteName: null,
  siteAddress: null,
  tradeName: null,
  priorityName: null,
  scope: null,
  notToExceedAmount: null,
  coordinatorName: null,
  coordinatorEmail: null,
  coordinatorPhone: null,
};

describe("registry shape", () => {
  it("has unique, lowercase, brace-free token names", () => {
    const names = DISPATCH_TOKENS.map((t) => t.token);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toBe(n.toLowerCase());
      expect(n).not.toMatch(/[{}@]/);
    }
  });

  it("gives every token a description for the operator reference", () => {
    for (const t of DISPATCH_TOKENS) expect(t.description.trim().length).toBeGreaterThan(0);
  });

  // Adding a token must be ONE registry entry — this pins that the resolver is driven by the
  // registry rather than a hand-maintained switch that could drift from it.
  it("resolves every registered token from a full context", () => {
    for (const t of DISPATCH_TOKENS) {
      const { text, missing, unknown } = renderDispatchTemplate(`{${t.token}}`, FULL);
      expect(unknown).toEqual([]);
      expect(missing).toEqual([]);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe("substitution", () => {
  it("substitutes each known token's value", () => {
    const { text } = renderDispatchTemplate(
      "WO {jobnumber} for {client} at {site} — {trade}, {priority}",
      FULL,
    );
    expect(text).toBe(
      "WO 1042 for Acme Retail Co at SF Downtown Store — Refrigeration, Urgent",
    );
  });

  it("formats money rather than emitting the raw column value", () => {
    expect(renderDispatchTemplate("NTE {nte}", FULL).text).toBe("NTE $750.00");
  });

  it("treats {dne} as an alias of {nte}", () => {
    expect(renderDispatchTemplate("{dne}", FULL).text).toBe(
      renderDispatchTemplate("{nte}", FULL).text,
    );
  });

  // An operator should not have to remember casing.
  it("matches tokens case-insensitively", () => {
    expect(renderDispatchTemplate("{NTE} {Client} {sItE}", FULL).text).toBe(
      "$750.00 Acme Retail Co SF Downtown Store",
    );
  });

  it("substitutes a token appearing more than once", () => {
    expect(renderDispatchTemplate("{client} / {client}", FULL).text).toBe(
      "Acme Retail Co / Acme Retail Co",
    );
  });

  it("reports which tokens resolved", () => {
    const { resolved } = renderDispatchTemplate("{client} {nte}", FULL);
    expect(resolved).toEqual(["client", "nte"]);
  });

  it("is deterministic", () => {
    const t = "WO {jobnumber} — {scope} — call {coordinator}";
    expect(renderDispatchTemplate(t, FULL)).toEqual(renderDispatchTemplate(t, FULL));
  });
});

describe("missing values are omitted, not advertised", () => {
  // ★ The core rendering rule. "[not set]" would advertise an internal gap to an outside party,
  // and a bare "NTE:" label reads as "no limit" rather than "unknown" — dangerous on the one field
  // that caps spend.
  it("drops a line whose only content was an absent token", () => {
    const { text } = renderDispatchTemplate("Check in at the desk.\nNTE: {nte}", EMPTY);
    expect(text).toBe("Check in at the desk.");
  });

  it("never renders a placeholder marker for an absent value", () => {
    const { text } = renderDispatchTemplate("{nte} {coordinator} {siteaddress}", EMPTY);
    expect(text).not.toMatch(/not set|N\/A|undefined|null|\[|\]/i);
  });

  it("reports the missing token names", () => {
    const { missing } = renderDispatchTemplate("{nte} and {coordinatorphone}", EMPTY);
    expect(missing).toEqual(["coordinatorphone", "nte"]);
  });

  it("keeps the surrounding prose when only one of several tokens is absent", () => {
    const ctx = { ...FULL, notToExceedAmount: null };
    const { text } = renderDispatchTemplate("Client {client}, NTE {nte}, trade {trade}", ctx);
    expect(text).toContain("Acme Retail Co");
    expect(text).toContain("Refrigeration");
    expect(text).not.toContain("$");
  });

  it("treats a whitespace-only value as missing", () => {
    const { text, missing } = renderDispatchTemplate("{client}", { ...EMPTY, clientName: "   " });
    expect(text).toBe("");
    expect(missing).toEqual(["client"]);
  });

  it("preserves lines that never held a token", () => {
    const { text } = renderDispatchTemplate("Line one\n\nLine three\nNTE: {nte}", EMPTY);
    expect(text).toBe("Line one\n\nLine three");
  });
});

describe("unknown tokens survive verbatim", () => {
  // An operator typo must never crash a work order or silently vanish — leaving it visible is
  // what surfaces the mistake.
  it("leaves an unregistered token in place", () => {
    const { text, unknown } = renderDispatchTemplate("Scope: {scpoe}", FULL);
    expect(text).toBe("Scope: {scpoe}");
    expect(unknown).toEqual(["scpoe"]);
  });

  it("reports the unknown name as the operator typed it", () => {
    const { unknown } = renderDispatchTemplate("{FooBar}", FULL);
    expect(unknown).toEqual(["FooBar"]);
  });

  it("does not drop a line that held only an unknown token", () => {
    expect(renderDispatchTemplate("{nope}", FULL).text).toBe("{nope}");
  });

  it("substitutes known tokens alongside an unknown one", () => {
    const { text, resolved, unknown } = renderDispatchTemplate("{client} {bogus}", FULL);
    expect(text).toBe("Acme Retail Co {bogus}");
    expect(resolved).toEqual(["client"]);
    expect(unknown).toEqual(["bogus"]);
  });

  // '@' appears naturally in these templates (an "invoice to ap@client.com" clause), which is
  // exactly why braces are the only syntax.
  it("leaves @-prefixed words entirely alone", () => {
    const t = "Email invoices to ap@client.com and cc @coordinator";
    expect(renderDispatchTemplate(t, FULL).text).toBe(t);
  });

  it("ignores brace-adjacent prose that is not a token", () => {
    const t = "Use form { A } or {} as needed";
    expect(renderDispatchTemplate(t, FULL).text).toBe(t);
  });
});

describe("empty and absent templates", () => {
  it("returns empty for a null template", () => {
    expect(renderDispatchTemplate(null, FULL)).toEqual({
      text: "",
      resolved: [],
      missing: [],
      unknown: [],
    });
  });

  it("returns empty for a whitespace-only template", () => {
    expect(renderDispatchTemplate("   \n  ", FULL).text).toBe("");
  });

  it("never throws on arbitrary operator prose", () => {
    for (const t of ["", "{", "}", "{{}}", "{a}{b}{c}", "100% {nte}"]) {
      expect(() => renderDispatchTemplate(t, EMPTY)).not.toThrow();
    }
  });
});

describe("siteAddressLine", () => {
  it("builds one line from the location parts", () => {
    expect(
      siteAddressLine({
        addressLine1: "123 Market St",
        addressLine2: null,
        city: "San Francisco",
        stateProvince: "CA",
        postalCode: "94103",
      }),
    ).toContain("123 Market St");
  });

  it("is null when there is nothing to render", () => {
    expect(
      siteAddressLine({
        addressLine1: null,
        addressLine2: null,
        city: null,
        stateProvince: null,
        postalCode: null,
      }),
    ).toBeNull();
  });
});

// ── FIX 1 REGRESSION GUARD — which NTE a template means ───────────────────────────────
// The bug this locks: {nte} read jobs.not_to_exceed_amount while the work order's NTE box read
// assignment.agreed_nte_amount, so a template saying "NTE: {nte}" rendered BLANK beside a box
// showing $1,200.00 — the two disagreeing about the one number that caps a vendor's spend.
describe("resolveTemplateNte — the assignment's ceiling wins", () => {
  it("prefers the assignment's agreed NTE over the job's", () => {
    expect(resolveTemplateNte("1200.00", "5000.00")).toBe("1200.00");
  });

  it("uses the assignment's NTE even when the job has none — the original bug", () => {
    expect(resolveTemplateNte("1200.00", null)).toBe("1200.00");
  });

  it("falls back to the job's NTE only when no assignment is in scope", () => {
    expect(resolveTemplateNte(null, "5000.00")).toBe("5000.00");
    expect(resolveTemplateNte(undefined, "5000.00")).toBe("5000.00");
  });

  it("is null when neither exists", () => {
    expect(resolveTemplateNte(null, null)).toBeNull();
    expect(resolveTemplateNte(undefined, undefined)).toBeNull();
  });
});

describe("{nte}/{dne} render the assignment's agreed NTE", () => {
  // The end-to-end shape of the fix: the assembler feeds resolveTemplateNte's output into the
  // context, so a template renders the vendor's own ceiling — never blank while a box shows a figure.
  const ctx = (over: Partial<DispatchTemplateContext>): DispatchTemplateContext => ({
    ...EMPTY,
    ...over,
  });

  it("renders $1,200.00, not blank, when the assignment carries the ceiling", () => {
    const c = ctx({ notToExceedAmount: resolveTemplateNte("1200.00", null) });
    expect(renderDispatchTemplate("NTE: {nte}", c).text).toBe("NTE: $1,200.00");
    expect(renderDispatchTemplate("NTE: {dne}", c).text).toBe("NTE: $1,200.00");
  });

  it("does NOT drop the NTE line when an assignment ceiling exists", () => {
    const c = ctx({ notToExceedAmount: resolveTemplateNte("1200.00", null) });
    const { text, missing } = renderDispatchTemplate("Site rules apply.\nNTE: {nte}", c);
    expect(missing).toEqual([]);
    expect(text).toBe("Site rules apply.\nNTE: $1,200.00");
  });

  it("never renders the job's NTE while an assignment ceiling exists", () => {
    const c = ctx({ notToExceedAmount: resolveTemplateNte("1200.00", "5000.00") });
    const { text } = renderDispatchTemplate("{nte}", c);
    expect(text).toBe("$1,200.00");
    expect(text).not.toContain("5,000");
  });

  // The pre-fix behaviour, kept explicit: with genuinely no assignment the job's value is correct.
  it("renders the job's NTE when there is no assignment", () => {
    const c = ctx({ notToExceedAmount: resolveTemplateNte(null, "5000.00") });
    expect(renderDispatchTemplate("{nte}", c).text).toBe("$5,000.00");
  });
});

// ── FIX 2 — the partial-line limitation, ACCEPTED and pinned rather than parsed ────────
// A token resolving empty MID-line leaves a dangling connective. This is not fixed by a parser
// (English-only, end-of-line-only, and it would have to be right about prose it cannot see);
// it is mitigated by keeping the referenced data populated. These tests pin BOTH halves so the
// decision is visible in the suite rather than only in a comment.
describe("partial-line limitation (documented, not parsed)", () => {
  const CONTACT = "Questions: contact {coordinator} at {coordinatoremail} or {coordinatorphone}.";
  const withPhone: DispatchTemplateContext = {
    ...EMPTY,
    coordinatorName: "Jonny Rosero",
    coordinatorEmail: "ops@example.test",
    coordinatorPhone: "4155550142",
  };

  it("renders cleanly when the referenced data IS populated — the mitigation", () => {
    const { text, missing } = renderDispatchTemplate(CONTACT, withPhone);
    expect(missing).toEqual([]);
    expect(text).toBe(
      "Questions: contact Jonny Rosero at ops@example.test or 4155550142.",
    );
  });

  // Pinned as KNOWN behaviour, not asserted as desirable: with no phone the connective dangles.
  // If a trimmer is ever built, this expectation is the one that should change.
  it("leaves a dangling connective when a mid-line token is empty (known limit)", () => {
    const { text, missing } = renderDispatchTemplate(CONTACT, {
      ...withPhone,
      coordinatorPhone: null,
    });
    expect(missing).toEqual(["coordinatorphone"]);
    expect(text).toBe("Questions: contact Jonny Rosero at ops@example.test or .");
  });

  // The author-side mitigation: one contact method per line lets the existing drop rule work.
  it("drops the line cleanly when the empty token is alone on its own line", () => {
    const { text } = renderDispatchTemplate(
      "Questions: contact {coordinator}\nEmail: {coordinatoremail}\nPhone: {coordinatorphone}",
      { ...withPhone, coordinatorPhone: null },
    );
    expect(text).toBe("Questions: contact Jonny Rosero\nEmail: ops@example.test");
    expect(text).not.toContain("Phone:");
  });
});
