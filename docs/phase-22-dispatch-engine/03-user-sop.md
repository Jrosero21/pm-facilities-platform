# Phase 22 — User SOP

Audience: the **operator**. Phase 22 adds two per-location controls (preferred vendors, blocked vendors) and changes how the dispatch candidate list is ordered.

## Set a preferred vendor for a location + trade

On a client location's detail page (`/clients/<clientId>/locations/<locationId>`), in the **Preferred vendors** section:

1. **Add a preferred vendor** — pick a **vendor**, a **trade**, and a **priority** (a whole number; **1 = highest** preference). Optionally add a note.
2. The list shows each preferred vendor with its trade, priority, and notes, ordered by priority (strongest first).
3. **Remove** clears a preference (it's archived, not hard-deleted — the history is kept). Re-adding the same vendor for the same trade later simply **brings the preference back** (with your new priority/notes) — it doesn't error or duplicate.

> Preference is an **ordering**, not an override. A preferred vendor still has to pass the eligibility floor (covers the trade, serves the location, compliant, not blocked). A preferred vendor who is **blocked** at the location is **excluded** — blocking always wins.

## Bar (block) a vendor at a location

In the **Blocked vendors** section of the same page:

1. **Block a vendor** — pick a **vendor** and optionally a **reason** ("repeated no-shows", etc.). The block applies to **this location for any trade** ("never send them here again").
2. The list shows each blocked vendor with the reason, **who** blocked them, and **when**.
3. **Unblock** clears a block (archived, not hard-deleted — the who/when/reason trail is preserved).

> A blocked vendor is removed from the dispatch candidate list **before** preference is even considered — they will not be offered or auto-picked for this location. (A **client-wide** ban — bar a vendor across all a client's locations — is honored by the engine if present, but authoring it from the UI is not in this phase; see `10-known-limitations.md`, CF-22.3.)

## What changed in the dispatch candidate list

When you dispatch a vendor to a job (`/jobs/<id>/dispatch/new`), the candidate list is unchanged in **who** is eligible (trade + geographic coverage + compliance as before) **plus** any vendor blocked at the job's location is now removed. The **ordering** now puts the location's **preferred vendors first** (by priority), then falls back to the existing ranking (primary-trade match → tightest geographic match → name). You still pick and send manually — nothing auto-dispatches in this phase.
