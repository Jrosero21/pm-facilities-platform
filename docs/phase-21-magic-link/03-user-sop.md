# Phase 21 — User SOP

Two audiences: the **vendor** who receives a link, and the **operator** who sends/revokes it.

## Vendor — acting on a work order via a link (no account)

1. You receive an **email** with a link ("Open your assignment (no account needed): …"). The link is
   **for you only** and **expires in 7 days**.
2. **Open the link** — it goes straight to your assignment. **No login, no password, no account.**
3. You see the one work order the link is for: the problem, location, and schedule.
4. Take the action your assignment is up to (the page shows only the ones available for its current
   status):
   - **Accept** or **Decline** the dispatch (decline can carry a reason).
   - **Confirm ETA** (enter a date/time you'll arrive).
   - **Confirm schedule.**
   - **Mark on-site** when you arrive.
   - **Mark work complete** when you're done.
5. Anytime, you can **add a note** or **upload a photo** (phone: the camera opens directly; desktop:
   pick a file — JPG/PNG/WEBP/HEIC, up to 15 MB).

> The link works for **this one work order only** — it cannot reach any other job. If you see
> **"This link is no longer valid,"** the link has **expired**, been **revoked**, or is **incorrect** —
> ask your operator contact to send a fresh one.

### What a link does NOT do

- It does **not** sign you into an account or show you any other job.
- It does **not** let you submit an **invoice** (that needs a registered vendor account).
- Notes and photos you add are **internal to the aggregator** — they are **not** automatically shown to
  the client; an operator decides what's shared.

## Operator — sending and revoking a link

On the dispatch detail page (`/jobs/<id>/dispatch/<assignmentId>`), in the **Vendor link** section:

1. **Send link** — sends the vendor contact a fresh magic link by email and records it in the token
   list (state **active**). The button is **disabled** if the assignment has **no contact email** (set a
   contact with an email first — no link can be sent without one).
2. The **token list** shows each link's state: **active** / **unsent** / **expired** / **revoked**,
   with when it was created / sent / expires.
3. **Revoke** — immediately invalidates a link; the vendor's next action fails with "This link is no
   longer valid." Use this if the wrong contact was reached or the link should no longer work. (Already-
   open image thumbnails may stay viewable for a few minutes — see `10-known-limitations.md`.)

> Each **Send** mints a **new** link — re-sending does not reuse an old token. The raw link is sent only
> to the vendor; it is never shown back in the operator UI.
