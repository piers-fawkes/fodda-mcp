# Brief MCP — Deploy Security Hardening, Key Exclusion & Build Payload Reduction

**For:** MCP Agent (`Fodda MCP`)
**From:** CE Agent (`Fodda CE`, coordinated with Piers 2026-10-04)
**Status:** ✅ Ready for MCP Agent execution.
**Priority:** P0 (Security: Private cryptographic key and GitHub token currently uploaded to Cloud Build).

---

## Context

An audit of the Cloud Run deploy process (`deploy_cloud_run.sh`) revealed that `gcloud run deploy --source .` uploads **194 files totaling 3.63 MB** to Google Cloud Build on every deploy.

Most critically, **sensitive private credentials are included in the source upload archive**:
1. **`fodda_mcp_registry_key.pem`** (769 bytes — private cryptographic key)
2. **`.mcpregistry_github_token`** (40 bytes — GitHub access token)

In addition, non-runtime binaries and stale datasets are packaged into the deploy context:
- `fodda-vscode/` with 9 pre-compiled `.vsix` binary extensions totaling ~450 KB, `icon.png` (41 KB), and `package-lock.json` (139 KB).
- Stale scrape data in root: `graph_profiles.json` (206 KB), `graph_profiles_fixed.csv` (170 KB), and `graph_profiles_fixed-llm.csv` (160 KB).
- Unused static assets: `public/favicon.png` (398 KB) — the server in `src/index.ts` generates metadata routes programmatically and does not serve static files.
- `test-mcp-server/` test harness.

---

## What to Build

### 1. P0 Security: Exclude Secret Keys & Tokens

In both `.gcloudignore` and `.dockerignore`, add explicit patterns to ensure no private keys or tokens can ever enter the upload tarball or Docker build layer:

```gitignore
# Security: Private keys, registry credentials, and tokens
*.pem
*.key
*token*
.mcpregistry_github_token
fodda_mcp_registry_key.pem
```

### 2. Exclude Subprojects, Binaries, and Stale Data

In both `.gcloudignore` and `.dockerignore`, add:

```gitignore
# Subprojects & Extension binaries
fodda-vscode/
test-mcp-server/

# Stale scrape fixtures & CSV dumps
graph_profiles*

# Unserved static assets (metadata routes are dynamically generated in code)
public/
```

### 3. Update `.dockerignore` for Local Builds

Ensure `.dockerignore` has the exact same exclusions so that local Docker builds (`docker build .`) do not copy sensitive credentials or VS Code extension binaries into the intermediate builder image.

---

## Verification Steps

1. **Verify Credentials Excluded**:
   Run python inspection using the gcloud ignore library:
   ```bash
   PYTHONPATH=/Users/piersfawkes/google-cloud-sdk/lib:/Users/piersfawkes/google-cloud-sdk/lib/third_party python3 -c "
   import os
   from googlecloudsdk.command_lib.util import gcloudignore
   mcp_dir = '/Users/piersfawkes/Documents/Fodda MCP'
   fc = gcloudignore.GetFileChooserForDir(mcp_dir)
   files = list(fc.GetIncludedFiles(mcp_dir))
   for f in files:
       if any(k in f.lower() for k in ['.pem', 'token', 'vsix', 'graph_profiles', 'public/favicon']):
           print('FAIL: Still included ->', f)
   print('Total files now:', len(files))
   "
   ```
   Confirm that 0 security-sensitive or binary files are listed. Total upload size should drop from 3.63 MB to ~1.8 MB.

2. **Verify Build**:
   Run `npm run build` locally to confirm TypeScript compilation passes without errors.

3. **Update Documentation**:
   Document the deploy hardening in `CHANGELOG.md`.
