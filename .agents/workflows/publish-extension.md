---
description: Publish the Fodda VS Code extension to Open VSX and Microsoft Marketplace
---

# Publish Fodda VS Code Extension

// turbo-all

## Pre-flight

1. Bump version in `package.json`:
```bash
cat /Users/piersfawkes/Documents/Fodda\ MCP/fodda-vscode/package.json | grep '"version"'
```
Update `"version"` to the next patch/minor as appropriate.

## Build

2. Compile and package:
```bash
cd /Users/piersfawkes/Documents/Fodda\ MCP/fodda-vscode && npm run compile && npx @vscode/vsce package --no-dependencies
```
If prompted about LICENSE, confirm with `y`.

## Publish to Open VSX (Cursor, Windsurf)

3. Publish:
```bash
cd /Users/piersfawkes/Documents/Fodda\ MCP/fodda-vscode && npx ovsx publish fodda-*.vsix --pat ovsxat_[REDACTED]
```

**Listing:** https://open-vsx.org/extension/fodda/fodda

## Publish to Microsoft VS Code Marketplace

4. Publish:
```bash
cd /Users/piersfawkes/Documents/Fodda\ MCP/fodda-vscode && npx @vscode/vsce publish --pat vsce_[REDACTED]
```
If prompted about LICENSE, confirm with `y`.

**Listing:** https://marketplace.visualstudio.com/items?itemName=fodda.fodda

## Verify

5. Confirm both listings show the new version:
- Open VSX: https://open-vsx.org/extension/fodda/fodda
- MS Marketplace: https://marketplace.visualstudio.com/items?itemName=fodda.fodda (may take 5-15 min to propagate on first publish)

## Extension Details

- **Source:** `/Users/piersfawkes/Documents/Fodda MCP/fodda-vscode/`
- **Publisher ID:** `fodda`
- **Extension ID:** `fodda.fodda`
- **Namespace:** `fodda` (verification pending via Eclipse Foundation)
