---
description: Stand up a new Fodda bot on a third-party agent marketplace (Grok Bot, ChatGPT, etc.)
---

# Launch Marketplace Bot Workflow

> Invoke: `/launch-marketplace-bot <slug>`
> Repeatable path for putting a Fodda-configured bot on a third-party marketplace. The MCP side is
> almost entirely configuration — the auth and attribution machinery already exists. This workflow
> exists so each new bot gets the same verification rather than a fresh improvisation.

## Step 1: Name the slug and the tool scope

Pick a slug (`grok-trends`, `grok-earnings`, …) and decide its tool allowlist. Write the list down
before editing — a marketplace bot's surface area is a product decision, not a default.

Two constants:
- Start from the **nearest existing offering** in `OFFERING_SCOPED_TOOLS` and diff against it.
  Never edit an existing offering to suit a new bot; add a new entry.
- Exclude heavy multi-call operations (`deep_research_topic`) unless the bot's whole purpose is
  that operation. A marketplace visitor on Base tier is the wrong place to fire one by accident.

## Step 2: Register the slug

Add the entry to `OFFERING_SCOPED_TOOLS` in `src/index.ts`. This single map drives tool scoping,
the slug-specific OAuth metadata path, and `X-Fodda-Source` attribution — there is no second
registration point.

## Step 3: Verify the OAuth handshake on the new slug

```bash
curl -s https://mcp.fodda.ai/.well-known/oauth-protected-resource/<slug>
```

Expect `resource` ending in `/<slug>` and `authorization_servers` listing the Clerk issuer.

Then confirm an anonymous `initialize` POST to `/<slug>` returns `401` with a `WWW-Authenticate`
header whose `resource_metadata` points at that same slug path. That header is what makes a
compliant client auto-start the OAuth flow; without it the bot silently fails to acquire an account.

The end-to-end Fodda side of the flow (discovery → DCR → PKCE authorize → consent) is already
covered daily by `functions/v1/oauthProbe.ts` in the API repo. Do not rebuild it here.

## Step 4: Verify tool scoping

Authenticated `tools/list` on `/<slug>` returns exactly the intended allowlist. Assert both
directions — every intended tool present, and at least one out-of-scope tool absent. Paste the
actual list into the verification; do not assert by count.

## Step 5: Verify attribution

Confirm a fanned-out upstream call from a `/<slug>` session carries `X-Fodda-Source: <slug>`.

This step is not optional. Attribution is the only way a marketplace bot's conversion can be
measured afterwards, and it cannot be backfilled once traffic has run.

## Step 6: Prove the client half by hand

The Fodda half being green does not mean the marketplace client works. Third-party MCP clients have
had `redirect_uri` handling bugs. Before any public listing, add the bot from a throwaway account
on the marketplace itself and complete a real OAuth handshake end to end, landing on a real Fodda
account. This is a manual step — it cannot be asserted from this repo.

Run it as a **template copy**, not as a fresh configuration, because those are different tests.
Platforms that share bots as templates typically carry instructions and memories but drop stored
credentials, and may carry only first-party connectors. Three outcomes to distinguish:

- Connection carried, OAuth completed → channel works.
- Connection carried, OAuth failed → blocked on the platform; capture the exact error.
- Connection did not carry → the template distributes *instructions only*; the bot's own
  instructions must then carry the connection step, and the funnel has an extra manual stage.

Do this before writing any listing copy. A negative result changes the plan, not the wording.

## Step 6b: Put the routing in the bot instructions

Whatever the platform carries across a copy is the real product surface. Where instructions travel
and tool descriptions do not, the guidance on which tool answers which shape of question belongs in
the bot's instructions.

Always include a self-healing line: if the Fodda tools are unavailable, the bot should say so and
point at `mcp.fodda.ai` rather than silently substituting web browsing and presenting the result as
Fodda's. Agents with their own browser will otherwise paper over a broken connection — producing a
worse answer, no attribution, and no signal that anything failed.

## Step 7: Confirm no existing surface moved

Diff `OFFERING_SCOPED_TOOLS` and show the change is purely additive. Existing slugs are live
surfaces with their own consumers.

## Step 8: Write the marketplace description

Describe what the bot does, not what it is named. A bot whose description fights its own name
(a general-purpose assistant labelled as a trends tool) mis-sets expectations from week one, and
the resulting usage data will not answer the question the launch was meant to test.
