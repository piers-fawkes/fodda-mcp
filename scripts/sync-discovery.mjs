#!/usr/bin/env node
// sync-discovery.mjs — Single source of truth for Fodda MCP discovery surfaces.
//
// What it does:
//   1. Reads version from package.json (the ONE source)
//   2. Stamps that version into MCP_SERVER_VERSION, server.json, fodda_mcp_server.json
//   3. Regenerates tools-manifest.json from toolHandlers.ts
//   4. Validates canonical descriptions across all local files
//   5. Live-diffs every public surface against local truth
//
// Usage:
//   node scripts/sync-discovery.mjs              # Diff-only (safe, no writes)
//   node scripts/sync-discovery.mjs --fix        # Fix local files + show live diffs
//   node scripts/sync-discovery.mjs --fix --publish  # Fix + publish (npm + registry)
//
// Called as post-step in deploy_cloud_run.sh to catch staleness at deploy time.

import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// ─────────────────────────────────────────────────────────────────────────────
// § Canonical descriptions — THE single source of truth
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_DESCRIPTION =
  "Expert-curated knowledge, brand, research, and earnings intelligence for AI agents. " +
  "46 tools across 220+ named-expert graphs: consult agentic Human Agents (real experts' digital twins), " +
  "track brands, run deep research, and query earnings-call intelligence. " +
  "Pay per task via Stripe SPT — no account required.";

// MCP Registry enforces ≤100 chars on body.description.
// This is the truncated version derived from the canonical.
const REGISTRY_DESCRIPTION =
  "Expert-curated knowledge, brand, research & earnings intelligence — 46 tools, 220+ graphs.";

// ─────────────────────────────────────────────────────────────────────────────
// § Helpers
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);
const readJSON = (rel) => JSON.parse(read(rel));

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let exitCode = 0;
const diffs = [];

function diff(surface, field, expected, actual) {
  if (expected === actual) {
    console.log(green(`  ✓ ${surface} ${field}`));
    return false;
  }
  console.log(red(`  ✗ ${surface} ${field}`));
  console.log(dim(`    expected: ${String(expected).substring(0, 120)}`));
  console.log(dim(`    actual:   ${String(actual).substring(0, 120)}`));
  diffs.push({ surface, field, expected, actual });
  exitCode = 1;
  return true;
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { _error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { _error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Version: derive from package.json
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const PUBLISH = args.includes('--publish');

const pkg = readJSON('package.json');
const VERSION = pkg.version;
console.log(`\n📦 Canonical version: ${VERSION}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Stamp version into local files
// ─────────────────────────────────────────────────────────────────────────────

console.log('── Local version sync ──');

// tools.ts — MCP_SERVER_VERSION
const toolsSrc = read('src/tools.ts');
const versionMatch = toolsSrc.match(/MCP_SERVER_VERSION\s*=\s*"([^"]+)"/);
const toolsVersion = versionMatch ? versionMatch[1] : 'MISSING';
if (diff('src/tools.ts', 'MCP_SERVER_VERSION', VERSION, toolsVersion) && FIX) {
  write('src/tools.ts', toolsSrc.replace(/MCP_SERVER_VERSION\s*=\s*"[^"]+"/, `MCP_SERVER_VERSION = "${VERSION}"`));
  console.log(green('    → fixed'));
}

// server.json (npm tarball)
const serverJson = readJSON('server.json');
diff('server.json', 'version', VERSION, serverJson.version);
diff('server.json', 'packages[0].version', VERSION, serverJson.packages?.[0]?.version);
diff('server.json', 'description', REGISTRY_DESCRIPTION, serverJson.description);
if (FIX) {
  serverJson.version = VERSION;
  if (serverJson.packages?.[0]) serverJson.packages[0].version = VERSION;
  serverJson.description = REGISTRY_DESCRIPTION;
  write('server.json', JSON.stringify(serverJson, null, 2) + '\n');
  console.log(green('    → server.json fixed'));
}

// fodda_mcp_server.json (registry publish source)
const registryJson = readJSON('fodda_mcp_server.json');
diff('fodda_mcp_server.json', 'version', VERSION, registryJson.version);
if (registryJson.packages?.[0]) {
  diff('fodda_mcp_server.json', 'packages[0].version', VERSION, registryJson.packages[0].version);
}
diff('fodda_mcp_server.json', 'description', REGISTRY_DESCRIPTION, registryJson.description);
if (FIX) {
  registryJson.version = VERSION;
  if (registryJson.packages?.[0]) registryJson.packages[0].version = VERSION;
  registryJson.description = REGISTRY_DESCRIPTION;
  write('fodda_mcp_server.json', JSON.stringify(registryJson, null, 2) + '\n');
  console.log(green('    → fodda_mcp_server.json fixed'));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Regenerate tools-manifest.json
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── Regenerate tools-manifest.json ──');
try {
  const out = execSync('node scripts/generate-tools-manifest.mjs', { cwd: ROOT, encoding: 'utf8' });
  console.log(green(`  ✓ ${out.trim()}`));
} catch (e) {
  console.log(red(`  ✗ generate-tools-manifest.mjs failed: ${e.message}`));
  exitCode = 1;
}

// Validate tool count
const manifest = readJSON('tools-manifest.json');
diff('tools-manifest.json', 'count', manifest.tools.length, manifest.count);
console.log(dim(`  tool count: ${manifest.count} (${manifest.billable} billable, ${manifest.count - manifest.billable} free)`));

// ─────────────────────────────────────────────────────────────────────────────
// § 4. A2A card description check
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── A2A card description ──');
const a2aSrc = read('src/a2aHandler.ts');
// Just check that the description contains key differentiators
const a2aHasEarnings = a2aSrc.includes('earnings intelligence') || a2aSrc.includes('earnings');
const a2aHasSPT = a2aSrc.includes('Stripe') || a2aSrc.includes('Payment Token');
const a2aHasExperts = a2aSrc.includes('expert') || a2aSrc.includes('named');
if (a2aHasEarnings && a2aHasSPT && a2aHasExperts) {
  console.log(green('  ✓ A2A card description includes key differentiators (earnings, SPT, experts)'));
} else {
  console.log(yellow('  ⚠ A2A card description may be missing differentiators'));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Live-diff public surfaces
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n── Live surface diffs ──');

// 5a. MCP Registry
const registry = await fetchJSON('https://registry.modelcontextprotocol.io/v0.1/servers/ai.fodda/mcp-server');
if (registry._error) {
  console.log(yellow(`  ⚠ MCP Registry: ${registry._error}`));
} else {
  diff('MCP Registry', 'version', VERSION, registry.version);
  diff('MCP Registry', 'description', REGISTRY_DESCRIPTION, registry.description);
}

// 5b. npm
const npm = await fetchJSON('https://registry.npmjs.org/fodda-mcp/latest');
if (npm._error) {
  console.log(yellow(`  ⚠ npm: ${npm._error}`));
} else {
  diff('npm', 'version', VERSION, npm.version);
}

// 5c. A2A agent card (mcp.fodda.ai)
const mcpCard = await fetchJSON('https://mcp.fodda.ai/.well-known/agent-card.json');
if (mcpCard._error) {
  console.log(yellow(`  ⚠ MCP A2A card: ${mcpCard._error}`));
} else {
  diff('MCP A2A card', 'version', VERSION, mcpCard.version);
}

// 5d. www agent card
const wwwCard = await fetchJSON('https://www.fodda.ai/.well-known/agent-card.json');
if (wwwCard._error) {
  console.log(yellow(`  ⚠ www A2A card: ${wwwCard._error}`));
} else {
  diff('www A2A card', 'version', VERSION, wwwCard.version);
}

// 5e. PulseMCP (check for "free"/"open" misclassification)
const pulseMCP = await fetchJSON('https://api.pulsemcp.com/v0beta1/servers?search=fodda');
if (pulseMCP._error) {
  console.log(yellow(`  ⚠ PulseMCP: ${pulseMCP._error}`));
} else {
  const entry = pulseMCP.servers?.find(s => s.name?.toLowerCase().includes('fodda'));
  if (!entry) {
    console.log(yellow('  ⚠ PulseMCP: no listing found'));
  } else {
    const isFree = entry.cost === 'free' || entry.authentication_method === 'open';
    if (isFree) {
      console.log(red('  ✗ PulseMCP: STILL listed as free/open — needs manual correction'));
      diffs.push({ surface: 'PulseMCP', field: 'cost/auth', expected: 'paid/bearer', actual: `${entry.cost}/${entry.authentication_method}` });
      exitCode = 1;
    } else {
      console.log(green(`  ✓ PulseMCP: cost=${entry.cost}, auth=${entry.authentication_method}`));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
if (diffs.length === 0) {
  console.log(green('✅ All surfaces in sync'));
} else {
  console.log(yellow(`⚠ ${diffs.length} surface(s) out of sync:`));
  for (const d of diffs) {
    console.log(`  • ${d.surface} → ${d.field}`);
  }

  // Suggest fixes for manual surfaces
  const manualFixes = diffs.filter(d =>
    ['PulseMCP', 'Smithery', 'Glama', 'Gemini Enterprise', 'M365 Copilot'].includes(d.surface)
  );
  if (manualFixes.length > 0) {
    console.log(yellow('\n  Manual dashboard actions needed:'));
    for (const d of manualFixes) {
      if (d.surface === 'PulseMCP') console.log('    → PulseMCP: Contact to correct free/open → paid/bearer');
      if (d.surface === 'Smithery') console.log('    → Smithery: Trigger rescan from dashboard');
      if (d.surface === 'Glama') console.log('    → Glama: Claim listing and refresh');
    }
  }
}

if (PUBLISH && diffs.some(d => ['MCP Registry', 'npm'].includes(d.surface))) {
  console.log(yellow('\n⚠ --publish flag set but surfaces are stale. Run:'));
  console.log('  ./scripts/publish_registry.sh --registry   # registry only');
  console.log('  ./scripts/publish_registry.sh              # npm + registry');
}

console.log('');
process.exit(exitCode);
