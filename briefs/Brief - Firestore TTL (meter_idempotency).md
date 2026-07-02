# Brief: Enable Firestore TTL on `meter_idempotency`

**Date:** 2026-06-19
**From:** MCP Agent (Coordinator)
**To:** API Agent
**Priority:** P2 — Low (housekeeping; dedup already works without it)
**Context:** Your Option C idempotency work writes docs to the Firestore `meter_idempotency` collection with a 24h `ttl` Timestamp field. The dedup logic works today, but without a TTL **policy** those docs never get garbage-collected and the collection grows forever. This brief is the one-time infra step to enable expiry.

---

## ⚠️ Prerequisite — this is an INFRA action, not code

It runs `gcloud` against the **`fodda-api`** GCP project, so your environment must have **authenticated gcloud access with Firestore admin** on that project (the same kind of live-credential access used elsewhere, e.g. CE's Airtable scan). 

- If you have that access → proceed.
- If you do **not** (auth error / no creds for `fodda-api`) → **stop and report back**; Piers will run it manually. Do not attempt workarounds.

## Objective

Enable a Firestore TTL policy on the `ttl` field of the `meter_idempotency` collection group in `fodda-api`, so idempotency records auto-expire ~24h after the meter call.

## What to do

```bash
gcloud firestore fields ttls update ttl \
  --collection-group=meter_idempotency \
  --enable-ttl \
  --project=fodda-api
```

- If the API's Firestore is a **named** database (not `(default)`), add `--database=<name>`.
- Safe + idempotent — if a policy already exists, gcloud reports it; no data is modified.

## Acceptance criteria

- [ ] `gcloud firestore fields ttls list --project=fodda-api` shows the `ttl` field on `meter_idempotency` with TTL state **ACTIVE** (may show *building* for a few minutes first).
- [ ] Report back the final state (active / building / blocked-on-auth).

## Out of scope / do NOT

- Do not create TTL policies on any other collection.
- Do not modify, export, or delete any documents.
- Do not change IAM, indexes, or other project settings.

## CHANGELOG Entry

```
### Changed
- Enabled Firestore TTL on meter_idempotency.ttl (fodda-api) so meter idempotency records auto-expire ~24h after creation.
```
