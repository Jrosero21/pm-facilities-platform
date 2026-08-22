import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAgentRedispatchSuggestion } from "@/server/redispatch-cancellation-rules";

// ★★ THE BUG THIS FILE EXISTS TO CATCH — a gate that is COMPUTED BUT NEVER READ.
//
// isAgentRedispatchSuggestion was correct and unit-tested from the day it was written. It still
// failed in production on the assignment record page, because that page did this:
//
//     const replacedIsStillSent = isAgentRedispatchSuggestion(replacedAssignment?.statusCode);
//     ...
//     {a.replacesAssignmentId ? <ApproveRedispatchButton .../> : <SendDispatchButton .../>}
//
// The gate was calculated, then the JSX branched on the RAW chain-link field anyway. TypeScript is
// silent (an unused const is not an error here) and every rules test still passed, so a browser
// walkthrough was the only thing that found it: a replacement created because a vendor PHONED to
// cancel was offering to "ghost the unresponsive vendor".
//
// No unit test of the rule could have caught that, and the page is an async server component that
// reads the database, so vitest cannot render it. What CAN be pinned is the wiring itself: the
// branch must ask the gate, and must not ask the raw column. These are source assertions —
// deliberately narrow, and cheap next to another silent re-break of the same seam.

const PAGE = path.resolve(
  import.meta.dirname,
  "(app)/jobs/[id]/dispatch/[assignmentId]/page.tsx",
);
const source = readFileSync(PAGE, "utf8");

/** The JSX branch that chooses between the ghost-flow button and the ordinary Send controls. */
const approveBranch = (() => {
  const at = source.indexOf("<ApproveRedispatchButton");
  expect(at, "ApproveRedispatchButton is no longer rendered on the record page").toBeGreaterThan(-1);
  // Walk back to the opening of the conditional that guards it.
  return source.slice(Math.max(0, at - 400), at);
})();

describe("record page — the approve/send branch is gated on the REPLACED assignment's state", () => {
  it("computes the gate from the replaced assignment's status", () => {
    expect(source).toContain(
      "isAgentRedispatchSuggestion(replacedAssignment?.statusCode)",
    );
  });

  it("BRANCHES on the gate, not merely computing it", () => {
    expect(approveBranch).toContain("replacedIsStillSent ?");
  });

  // The precise regression: `a.replacesAssignmentId ?` as the branch condition. Both re-dispatch
  // paths stamp that column, so it can never distinguish them.
  it("does not branch on the raw replacesAssignmentId column", () => {
    expect(approveBranch).not.toContain("a.replacesAssignmentId ?");
  });

  // A computed-but-unread gate is exactly what broke. If the identifier appears only once, it is
  // being calculated and thrown away again.
  it("reads the gate somewhere other than its own declaration", () => {
    const uses = source.match(/replacedIsStillSent/g) ?? [];
    expect(uses.length).toBeGreaterThan(1);
  });
});

// The behaviour the wiring above delivers, restated at the seam the page depends on, so this file
// fails loudly if the rule is ever inverted to match a mis-wired page.
describe("the gate's verdict for each path the record page can show", () => {
  it("operator cancellation replacement (replaced DECLINED) → ordinary Send, no ghost button", () => {
    expect(isAgentRedispatchSuggestion("DECLINED")).toBe(false);
  });

  it("agent suggestion (replaced still SENT) → the approve/ghost flow", () => {
    expect(isAgentRedispatchSuggestion("SENT")).toBe(true);
  });

  it("an ordinary dispatch replacing nothing → ordinary Send", () => {
    expect(isAgentRedispatchSuggestion(undefined)).toBe(false);
  });
});
