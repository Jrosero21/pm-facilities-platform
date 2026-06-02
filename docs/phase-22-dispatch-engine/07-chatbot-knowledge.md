# Phase 22 — Chatbot Knowledge

Knowledge the operations assistant can cite about Phase-22 dispatch routing. (`searchKnowledge` indexes this file; `readDoc` can fetch it in full.)

## Operators can set preferred vendors per location

- On a client location's page, an operator can mark **preferred vendors** for a specific **trade**, with a **priority** (1 = highest). The dispatch candidate list for jobs at that location then shows the **preferred vendors first**, then falls back to the standard ranking.
- Preference is an **ordering**, not an override — a preferred vendor still must be eligible (covers the trade, serves the location, compliant, not blocked). Removing a preferred vendor keeps the history; re-adding the same one later simply brings it back.

## Operators can block (bar) a vendor at a location

- An operator can **block** a vendor at a location ("never send them here again"), optionally with a reason. A block is a **company** exclusion — it applies to that location for **any** trade.
- A blocked vendor is removed from the dispatch candidate list **before** preference is even considered — blocking always wins over preferring. The block list records who blocked the vendor and when; unblocking keeps that history.

## Dispatch candidate lists are floor-filtered then preferred-first

- A job's candidate vendors are those that pass the **eligibility floor**: they cover the job's **trade**, **serve the job's location** (by national/state/city/postal match), are **not excluded by compliance**, and are **not blocked** at that location. This floor is the hard limit — nothing (no preference, and no future AI) can promote a vendor that fails it.
- Survivors are ordered **preferred-first** (by the location's preference priority), then by the existing tiebreak (primary-trade match, tightest geographic match, name).

## A rule-based auto-dispatch mechanism exists — but nothing triggers it yet

- The platform has a **deterministic auto-dispatch** function: it picks the **top eligible vendor** (preferred-first, no AI judgment) and creates a **DRAFT** assignment. It **never sends** — a draft is operator workspace, and an operator must explicitly send it.
- **Nothing auto-invokes this yet.** Whether and when it runs (and whether a draft may auto-advance to sent) is governed by the **autonomy policy engine in Phase 23**. Today all dispatch is operator-driven; the auto-dispatch is a built mechanism awaiting its governance layer. Every auto-created draft is logged as an autonomous action (system actor) so it is reviewable.

## What Phase 22 does NOT do

- No **AI** vendor scoring or tiebreaking (that is Phase 27, and is data-blocked today).
- No **automatic sending** — auto-dispatch stops at DRAFT.
- No **client-wide-ban authoring** from the UI yet (the engine honors a client-wide block if present, but you set blocks per-location for now), and no client-level default preferred vendor.
- Geographic matching is **equality-based** today (national/state/city/postal); radius/polygon coverage is a future refinement.
