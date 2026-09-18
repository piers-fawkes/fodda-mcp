---
description: Define, verify and launch a Fodda bot on a third-party agent marketplace (Grok Bot, ChatGPT, etc.)
---

# Launch Marketplace Bot Workflow

> Invoke: `/launch-marketplace-bot <slug>`
> Rev 2 (2026-09-17). Rev 1 was an MCP registration checklist. It was missing the half that
> actually decides whether a listing works: the product definition, the capability audit and the
> task-level evaluation. The technical steps below are unchanged and still required.

## Step 0: Product-definition gate — no slug until this is written down

A marketplace bot is a colleague with a job, not a set of tools. Before touching code, state:

- the bot's role and area of ownership;
- the target user and the situation that triggers them to open it;
- the **finished result** — what lands in front of them when the job is done;
- the evidence standard and which sources are required;
- the approval boundary (what it may never do unattended);
- missing-data behaviour;
- whether it recurs, and on what trigger.

If the finished result cannot be written in one paragraph, the bot is not defined yet. Stop here.

## Step 1: Capability audit — map every promise to a real source

For each element of the promised output, identify which of these supplies it:

- Fodda today;
- public web research;
- another connector the user must bring;
- a graph or dataset that does not exist yet;
- nothing — and therefore cannot be promised.

Do not promise buying-committee maps, technology stacks, sentiment scores or distribution footprints
unless an authoritative source exists. A promise with no source behind it is the fastest way to lose
a user on their first question.

Check names against capabilities, not the reverse. A tool whose name sounds adjacent to the job is
not evidence it does the job — confirm what it actually computes and over what inputs.

## Step 2: Choose the slug and the smallest allowlist

Start from the nearest existing entry in `OFFERING_SCOPED_TOOLS` and diff against it. Add a **new**
entry; never edit a live one.

Two standing exclusions:

- **Internal graph primitives** (`get_node`, `get_neighbors`, `get_label_values`) — they expose the
  ontology instead of the job and burn context budget.
- **Actions that spend money or a person's time** — consultation and intro requests belong behind
  explicit user approval on a surface built for them, not on a marketplace bot.

Exclude heavyweight multi-call operations unless the bot's whole purpose is that operation.

## Step 3: Establish who owns each tool description — before editing any

`npm run build` runs `scripts/sync-descriptions-from-airtable.mjs` **before** `tsc`. It rewrites the
description in `server.tool('<name>', '...')` from the Airtable Offerings table
(`tbl93DJ627r81zKVP`) for every tool with a row. Hand-edits in `toolHandlers.ts` are silently
reverted, and the script exits 0 when `AIRTABLE_API_KEY` is unset — so a local build can appear to
keep an edit that CI discards.

- Airtable row exists → edit in Airtable, sync, confirm it landed.
- No row → edit in code.

A description must say when to use the tool, what question shape it answers, what it returns, how it
differs from a general web search, and what happens when coverage is thin. Model selection is driven
by the description, not the name.

## Step 4: Register the slug

Add the entry to `OFFERING_SCOPED_TOOLS` in `src/index.ts`. This one map drives tool scoping, the
slug-specific OAuth metadata path and `X-Fodda-Source` attribution — there is no second registration
point.

## Step 5: Verify the OAuth handshake on the new slug

```bash
curl -s https://mcp.fodda.ai/.well-known/oauth-protected-resource/<slug>
```

Expect `resource` ending in `/<slug>` and the Clerk issuer in `authorization_servers`. Then confirm
an anonymous `initialize` POST to `/<slug>` returns `401` with a `WWW-Authenticate` header naming
that slug. Without that header a compliant client never starts OAuth and the bot silently fails to
acquire an account.

The Fodda half of the flow is already covered daily by `functions/v1/oauthProbe.ts` in the API repo.
Do not rebuild it.

## Step 6: Verify tool scoping and attribution

Authenticated `tools/list` on `/<slug>` returns exactly the intended allowlist. Assert both
directions — every intended tool present, at least one excluded tool absent. Paste the real list;
never assert by count.

Confirm a fanned-out call carries `X-Fodda-Source: <slug>`. This is not optional and cannot be
backfilled once traffic has run. Note what it does and does not tell you: it tags usage **after**
connection. It is not a conversion measure.

## Step 7: Prove the template copy by hand

The Fodda half being green does not mean the marketplace client works, and a fresh configuration is
a different test from a copy. Configure the bot, complete auth, share it as a template, add it from
an **unrelated** account, and ask a question that requires Fodda.

Record, as observations rather than expectations:

- whether the custom connection travels;
- whether credentials are correctly excluded;
- whether OAuth begins and redirect handling succeeds;
- whether the copy sees the intended tools;
- whether attribution survives;
- whether the bot reports a missing connector — or silently substitutes web browsing.

Secondary write-ups about what templates carry are useful but never definitive. Do not describe any
of this as confirmed until the copy has actually been made.

If the connection does not travel, the template distributes instructions only: the bot's own
instructions must carry a minimal connection flow, and it must refuse to label fallback web research
as Fodda output.

## Step 8: Task-level evaluation before listing

Run representative tasks covering: an obvious Fodda use; a question that should use web research
instead; a mixed task; an unsupported sector; an ambiguous company name; contradictory evidence;
stale or missing evidence; citation verification; connector missing; auth failure; routine retry.

Score: correct tool selection, unnecessary calls, citation accuracy, usefulness of synthesis,
latency, cost, output-contract compliance, and whether failure is graceful. Poor routing is a
description problem first — fix descriptions and re-run before concluding a new wrapper tool is
needed.

## Step 9: Confirm nothing existing moved

Diff `OFFERING_SCOPED_TOOLS` and show the change is purely additive. Existing slugs are live
surfaces with their own consumers.

## Step 10: Marketplace packaging

Ship the listing with: a role-led name; a one-sentence outcome; the target user; example tasks;
the output promise; starter prompts; keywords; the connector requirement stated plainly; the source
and evidence promise; and the limitations.

Describe what the bot does, not what it is named. A bot whose description fights its own name
mis-sets expectations from week one, and the usage data will not answer the question the launch was
meant to test.

## Step 11: Decide routine and spend safety before promoting recurrence

Marketplace routines run unattended on schedules, webhooks and signals. Before promoting any daily
or hourly Fodda workflow, decide the account-level ceiling, daily routine limits, threshold
warnings, retry-loop protection, usage visibility, insufficient-credit behaviour, and whether
heavyweight tools may run unattended at all.

Note the trap: the Base-free daily call cap is bypassed entirely for accounts with a payment method.
This is a launch constraint, not a follow-up.

## Step 12: Instrument what you can actually see

The funnel runs listing view → template opened → bot added → connector instruction shown → OAuth
started → OAuth completed → first tool call → first completed output → second session → routine
created. Fodda observes only from OAuth completion onward; the rest happens inside the marketplace.
State which stages any metric covers, and never imply coverage of stages the platform does not
expose.
