# Phase 25 — Chatbot Knowledge

Plain-language facts the assistant can use to answer questions about the feedback loop.

- **What it is:** the platform's two AI drafting agents (the client-update rewriter and the
  scope-of-work generator) now learn from how operators review their drafts. Approvals and edits the
  operator already makes become examples the agents see next time they run.
- **How corrections sharpen the agents:** when an operator edits a draft and then approves it, the
  difference between the original draft and the edited version is a "correction." The best recent
  corrections (and confirmed-good drafts) for that tenant are shown to the agent as examples — so its
  next first-draft is closer to what the operator wants. There is nothing to turn on; it happens
  automatically inside the agent's normal run.
- **Why it seems quiet today:** the system only has a tiny amount of review history so far (about one
  edited-and-approved example platform-wide). Few-shot learning is chosen precisely because it works
  with very little data, but the visible improvement grows as operators accumulate more reviews.
- **It does not change the review step:** AI output is still a draft that an operator must review and
  approve. The feedback loop makes the draft better; it never publishes anything on its own.
- **The honesty boundary:** the engineering team has proven the mechanism works and is *measurable*
  using a seeded test set — they have **not** claimed a measured improvement on real corrections yet,
  because there isn't enough live data to measure one. That live measurement becomes meaningful as the
  review tables fill.
- **Scope:** only the rewriter and scope generator participate. The dispatch router is rule-based (no
  draft to correct), and it learns nothing from this loop.
