---
description: Deploy Fodda MCP to Google Cloud Run
---

# Deploy Fodda MCP to Cloud Run

> [!CAUTION]
> Deploy to **`fodda-mcp`** (project: `fodda-mcp`, region: `us-east4`). Do NOT deploy to `fodda-api` or `fodda-sandbox` — those are separate services.

## Environment Setup

gcloud CLI is installed at a non-standard path. You MUST set these env vars before running any gcloud commands:

```bash
export CLOUDSDK_PYTHON=/usr/local/bin/python3.11
export PATH="/Users/piersfawkes/Downloads/google-cloud-sdk/bin:$PATH"
```

**Why:** gcloud is in `~/Downloads/google-cloud-sdk/`, not on the default PATH. Python 3.13 (the system default) is incompatible — use Python 3.11.

## Secret Management (One-Time Setup)

Secrets live in Google Secret Manager — **never in this file or `deploy_cloud_run.sh`**.

To create or rotate a secret:
```bash
export CLOUDSDK_PYTHON=/usr/local/bin/python3.11 && export PATH="/Users/piersfawkes/Downloads/google-cloud-sdk/bin:$PATH"

# Create new secret
echo -n "SECRET_VALUE" | gcloud secrets create SECRET_NAME --data-file=- --project=fodda-mcp

# Rotate existing secret
echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=- --project=fodda-mcp
```

## Deploy

// turbo-all
1. Build TypeScript:
```bash
cd /Users/piersfawkes/Documents/Fodda\ MCP && npm run build
```

2. Deploy to Cloud Run (runs health check automatically):
```bash
export CLOUDSDK_PYTHON=/usr/local/bin/python3.11 && export PATH="/Users/piersfawkes/Downloads/google-cloud-sdk/bin:$PATH" && cd /Users/piersfawkes/Documents/Fodda\ MCP && bash deploy_cloud_run.sh
```

## Rollback

If a deploy causes issues, roll back to the previous revision:
```bash
export CLOUDSDK_PYTHON=/usr/local/bin/python3.11 && export PATH="/Users/piersfawkes/Downloads/google-cloud-sdk/bin:$PATH" && gcloud run services update-traffic fodda-mcp --to-revisions=PREVIOUS=100 --region=us-east4 --project=fodda-mcp
```

To list all revisions and pick a specific one:
```bash
export CLOUDSDK_PYTHON=/usr/local/bin/python3.11 && export PATH="/Users/piersfawkes/Downloads/google-cloud-sdk/bin:$PATH" && gcloud run revisions list --service=fodda-mcp --region=us-east4 --project=fodda-mcp
```

## Required Env Vars

All secrets are mounted via Google Secret Manager. Non-sensitive vars are set directly in `deploy_cloud_run.sh`.

| Variable | Source | Purpose |
|---|---|---|
| `GOOGLE_AI_API_KEY` | Secret Manager | Gemini AI Studio key (editorial fill, `editorialFill.ts`) |
| `GEMINI_API_KEY` | Secret Manager | Gemini key for Waverunner deep research tools |
| `RESEND_API_KEY` | Secret Manager | Resend email API — feedback emails to piers@fodda.ai |
| `SLACK_BOT_TOKEN` | Secret Manager | Slack bot — posts frustration/feedback alerts to #fodda-sales |
| `FODDA_INTERNAL_API_KEY` | Secret Manager | Internal service key — skips billing for MCP-to-API calls |
| `FODDA_MCP_SECRET` | Secret Manager | HMAC signing secret shared with Fodda API for request integrity |
| `FODDA_API_URL` | `deploy_cloud_run.sh` | Fodda API base URL (`https://api.fodda.ai`) |
| `NODE_ENV` | `deploy_cloud_run.sh` | Set to `production` |
| `GOOGLE_CLOUD_PROJECT` | `deploy_cloud_run.sh` | GCP project ID (`fodda-mcp`) — used by Firestore trial tracker |

When adding a new secret to the codebase, update this table and `deploy_cloud_run.sh` at the same time.

## Service Details

- **Project:** `fodda-mcp`
- **Service:** `fodda-mcp`
- **Region:** `us-east4`
- **Console:** https://console.cloud.google.com/run/detail/us-east4/fodda-mcp/observability/metrics?project=fodda-mcp
- **Service URL:** https://fodda-mcp-7mopqjzhwq-uk.a.run.app
- **Logs:** https://console.cloud.google.com/run/detail/us-east4/fodda-mcp/logs?project=fodda-mcp

