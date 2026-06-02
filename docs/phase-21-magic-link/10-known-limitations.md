# Phase 21 — Known Limitations

## Functional boundaries (by design / locked decisions)

- **Presigned image URL outlives token revocation.** Linkless photos are served through the Phase-20
  presigned mechanism — a short-lived (~5-minute) **issuance-scoped** URL. Revoking a token stops **new**
  presigns immediately, but an **already-issued** image URL stays valid until it expires (the inherited
  Phase-20 issuance-window limitation). Authorization is enforced when the URL is generated, not per
  fetch.

- **`APP_URL` misconfiguration produces dead links.** Links are built as `${APP_URL}/link/<token>`; a
  wrong or unset `APP_URL` (dev fallback `http://localhost:3000`) sends vendors an unreachable link. It
  is a **deploy-time** variable that must be set in every non-local environment — see `04-admin-sop.md`.

- **7-day expiry is a fixed constant, not yet configurable.** Tokens expire at mint + 604800 s; there is
  no per-tenant or per-assignment expiry knob yet. A configurable window is deferred.

- **The token is visible in the URL.** A magic link carries the raw token in its path, so it can appear
  in **browser history** and **proxy / server access logs**. The protection model is **expiry +
  revocation + single-assignment scope** — **not** URL secrecy. Stated honestly: anyone who obtains the
  raw link within its window can act on that one assignment until it expires or is revoked. (The token is
  never stored or logged **server-side** — only its `sha256` hash — but the URL itself is a bearer
  credential.)

- **Mint-new-per-send accumulates token rows.** Each **Send** mints a fresh token (D-21.6), so an
  assignment re-sent N times has N token rows. This is **by design** (every link is independently
  revocable; no token resurrection) and the revoke UI surfaces each token's state; a row-pruning policy
  is not built. → banked soft as **CF-21.3**.

- **Invoice is intentionally excluded.** A link-holder cannot submit an invoice — the link surface
  exposes only the 8 non-financial actions (D-21.8). Invoicing requires a registered vendor account.

## Delivery / channel

- **Email only.** The link is delivered through the Phase-19 send seam, which is **channel-agnostic**,
  but **only the email provider is wired**. SMS delivery (a second `SendProvider`) is not built. →
  banked soft as **CF-21.4** (relates CF-19.2).

## Cross-cutting / disposition

- **Phase 21 retires NOTHING.** It is a pure build phase; no inherited carry-forward item is discharged.
  See `11-closeout.md` / `closeout-carryforwards.md`.

- **B-16.3 remains OPEN — the roadmap §6/§9 "retires B-16.3 (Phase 21)" claim is wrong.** B-16.3 is
  (a) the operator **chat UI** **and** (b) a **vendor-direction publish path for `update_rewrite_drafts`**
  (a `vendor_update`-sourced rewrite draft that today lands `pending_review` with no outbound target).
  Phase 21 built **neither** — it built magic-link **link** delivery (a new vendor-direction
  `communication_logs` send path), which only **partially unblocks** the outbound infrastructure. This
  is the **third** recurrence of the §6/§9 over-attribution pattern (after CF-19.4, CF-20.3) and is
  recorded as a doc-correction carry-forward (**CF-21.1**); the roadmap file is **not** edited in this
  phase.

## Inherited / standing

Standard watchpoints (pnpm not npm; MariaDB JSON parse-at-read; SSH tunnel for DB scripts; sandbox→prod
migration cadence; confirm the resolved DB name before any prod DDL; pre-name FKs >64 chars; drizzle
forward-FK ordering) carry forward unchanged.
