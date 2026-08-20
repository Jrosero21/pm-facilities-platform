import { describe, expect, it } from "vitest";
import {
  DISPATCH_TOKENS,
  renderDispatchTemplate,
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
