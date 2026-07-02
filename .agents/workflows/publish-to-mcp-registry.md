---
description: Publish Fodda MCP to npm and MCP Registry
---

# Publish to MCP Registry Workflow

This workflow publishes the Fodda MCP server to both npm and the MCP Registry.

## Prerequisites

- [x] DNS verification completed (ai.fodda namespace)
- [x] `mcpName` set in package.json
- [x] `server.json` validated
- [x] npm authentication configured
- [x] mcp-publisher CLI installed

## Step 1: Ensure build is up to date

```bash
npm run build
```

## Step 2: Verify the package contents

```bash
npm pack --dry-run
```

This shows what will be included in the npm package.

## Step 3: Publish to npm

```bash
npm publish --access public
```

**Note:** If you encounter 2FA requirements, you'll need to enter your OTP code.

## Step 4: Verify npm publication

```bash
npm view fodda-mcp
```

## Step 5: Authenticate with MCP Registry (if not already done)

For DNS-based authentication (since using ai.fodda namespace):

```bash
mcp-publisher login dns
```

Follow the prompts to complete DNS verification.

## Step 6: Validate server.json

```bash
mcp-publisher validate
```

## Step 7: Publish to MCP Registry

```bash
mcp-publisher publish
```

## Step 8: Verify MCP Registry publication

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server"
```

## Post-Publication

- Update CHANGELOG.md with publication details
- Tag the release in git
- Update documentation with installation instructions

## Troubleshooting

**npm 2FA Error:**
- Ensure you have 2FA configured on your npm account
- Use `npm publish --otp=<code>` with your authenticator code

**MCP Registry Authentication:**
- For DNS auth, ensure TXT record is properly configured
- For GitHub auth, use `mcp-publisher login github` instead

**Version Conflicts:**
- Ensure version in package.json matches server.json
- Check if version already exists on npm with `npm view fodda-mcp versions`
