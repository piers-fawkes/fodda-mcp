# Brief: MCP Identity & Connection-URL Scheme

> **Type:** `[x] Architecture Handoff`
> **Priority:** `[ ] P0` · `[ ] P1` · `[x] P2 — design now, build later`
> **Agent(s):** MCP agent (primary) · API agent (token issuance + identity store) · App agent (onboarding/URL distribution)
> **Status:** Design for consideration — **not scheduled.** Captured 2026-06-11 at Piers's request.
> **Related:** `BACKBURNER.md` → **C3 (Remove API Keys from URL Query Params)** — this brief is the broader scheme that C3 is the first step of. Also relates to the P0 surface-audit findings (`Brief MCP P0 Surface Audit Fixes.md`).

---

## 1. Problem

The MCP connection URL today carries **both** the API key and the user's email:
`https://mcp.fodda.ai/mcp?api_key=sk_live_…&user_id=<email>` (auth extraction at `src/index.ts:519`, `:527`). This conflates three separate concerns into two leaky values:

| Concern | Question | Today's carrier |
|:--------|:---------|:----------------|
| **Authentication** | May this caller in? | API key |
| **Identity** | Which user is this? | Email (`X-User-Id`) |
| **Billing / account** | Whose quota / plan? | API key (again) |

Consequences, several already observed in the P0 audit:
- **Secret-in-URL** — the live API key lands in Cloud Run access logs, proxy logs, browser history, referrer headers, and users' MCP client config files. (This is exactly C3.)
- **PII-in-URL** — the email is in the query string, and is the de-facto identity primary key.
- **Email-as-identity coupling** — because identity resolves through email/linked-record lookups, `get_my_account` returned `profile.name = "recZ1FemUPoLtuIuF"` (a raw Airtable record id) in the audit. Identity is fragile and tied to a mutable attribute.
- **Rotation pain** — rotating an account's API key breaks every URL that embeds it; you can't revoke one leaked connection without rotating the whole key.

**Goal (Piers, 2026-06-11):** identify users by a **unique key/ID**, not by API key + email.

---

## 2. Recommendation — separate the three concerns, in two phases

### Phase 1 — Opaque per-connection token (the "unique key")

Issue each user **one opaque, revocable connection token** carried in the URL **path**, not the query string:

```
https://mcp.fodda.ai/c/{token}
```

Server-side, the token resolves to a record: `{ internal_user_id, billing_account_id, scopes[], status }`.

- The token is **not** the API key and **not** the email. The real API key never leaves the Fodda backend — the MCP→API hop is already HMAC-signed (`FODDA_MCP_SECRET`, `index.ts:166`), so the MCP server doesn't need the user's API key in the URL to call the API on their behalf.
- Introduce a **stable internal `user_id`** as the identity primary key. **Email becomes an attribute, not the key.** This removes the email/record-id coupling at the root and fixes the `profile.name = rec…` class of bugs.
- Tokens are **per-connection and individually revocable** — kill one leaked URL without touching the account's API key or other connections.
- Path segment (`/c/{token}`) rather than `?token=` so it's less likely to be captured by referrer headers / naive proxy logging.

**Token format decision (see §4):** start with **opaque random, DB-backed** (Firestore) — revocation is free (delete/flag the row). A signed JWT is stateless but needs a denylist to revoke, which negates much of the benefit.

This Phase 1 step **delivers C3** (no API key in URL) and the unique-key identity in one move.

### Phase 2 — OAuth 2.1 for remote MCP (when the client mix justifies it)

Graduate to the **MCP authorization framework (OAuth 2.1)**, which Claude's remote-connector flow supports natively:
- Client runs an OAuth flow → short-lived **bearer access token** + refresh token. **No static secret in the URL at all.**
- Proper consent screen + scopes; tokens expire and refresh automatically.
- Phase 1's `internal_user_id` + `scopes` map directly onto the OAuth subject/claims — **Phase 1 is the foundation, not throwaway.**

Phase 2 is heavier (authorization server, token + refresh endpoints, dynamic client registration). Sequence it after Phase 1 once you know how many users connect via Claude's hosted connector vs. pasting a URL into a config file.

---

## 3. Migration (dual-accept, then sunset)

Mirror the deprecation pattern already used elsewhere in the P0 plans:
1. **Phase 1a:** stand up the token store + `/c/{token}` route. Keep honoring legacy `?api_key=&user_id=` (the header/query paths at `index.ts:519–527` stay as a fallback). Log a deprecation warning when the legacy form is used.
2. **Phase 1b:** mint a token for every existing user; email them the new `/c/{token}` URL; update onboarding + the `mcp_url` the API hands out (`/v1/graphs/mine`, noted in C3 item 4) to emit the new form.
3. **Phase 1c:** after the deprecation window, stop accepting `?api_key=` / email-as-identity. Require the token (or Phase 2 OAuth).

Backfill: each existing `{api_key, email}` pair maps to one `internal_user_id` + initial token at migration time.

---

## 4. Decisions for Piers (when this is picked up)

1. **Token format** — opaque DB-backed (recommended: free revocation, simple) vs signed JWT (stateless, needs denylist).
2. **OAuth now or later** — pull Phase 2 forward if most connections come through Claude's hosted connector; defer if most are config-file URL pastes.
3. **Scope granularity** — do tokens carry per-graph / per-tool scopes from day one, or just `{user, account}` with entitlements still resolved from the account record? (Start coarse; entitlements already live on the account.)
4. **One token per user vs per device/connection** — per-connection gives finer revocation but more to manage. Recommend per-connection with a friendly label.

---

## 5. How this pays down existing debt

- **Closes C3** (API key out of the URL) as a side effect of Phase 1.
- **Kills email-as-identity** → removes the `profile.name = rec…` failure mode and reduces PII exposure surface from the P0 audit.
- **Per-connection revocation** → leaked URLs become a contained, low-severity event instead of an account-key rotation.
- **Clean OAuth on-ramp** → the `internal_user_id` model is what Phase 2 needs anyway.

## 6. Acceptance (Phase 1)

- [ ] Connecting via `https://mcp.fodda.ai/c/{token}` authenticates and bills correctly with **no API key or email in the URL**.
- [ ] `internal_user_id` is the identity key; email is stored as an attribute and is **not** required to identify a session.
- [ ] Revoking a single token invalidates only that connection; the account's API key and other tokens keep working.
- [ ] Legacy `?api_key=&user_id=` still works during the window and logs a deprecation warning.
- [ ] `get_my_account` returns a human `profile.name` (or null) — never a `rec…` id — sourced from the new identity record.
