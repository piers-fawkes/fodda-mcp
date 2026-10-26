// Sync MCP Tool Descriptions from Airtable Offerings Table (tbl93DJ627r81zKVP)
// Fetches published tool descriptions from Airtable and updates src/toolHandlers.ts.
// Runs as part of `npm run build`.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appXUeeWN1uD9NdCW';
const TABLE_ID = 'tbl93DJ627r81zKVP';

if (!AIRTABLE_API_KEY) {
  console.log('[sync-descriptions] AIRTABLE_API_KEY not set — skipping Airtable description sync');
  process.exit(0);
}

async function sync() {
  try {
    let records = [];
    let offset = null;
    do {
      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}${offset ? `?offset=${offset}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
      });
      if (!res.ok) {
        console.warn(`[sync-descriptions] Airtable fetch returned HTTP ${res.status} — skipping sync`);
        process.exit(0);
      }
      const data = await res.json();
      records = records.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    const descriptionMap = new Map();
    for (const record of records) {
      const fields = record.fields || {};
      const toolKey = fields.mcp_tool_name || fields.key || fields.offering_key || fields.tool_name || fields.name;
      const desc = fields.description || fields.Description || fields.mcp_description || fields.published_description;
      if (toolKey && desc) {
        let cleanDesc = desc.trim()
          .replace(/\s*Price:\s*\$[\d.]+(?:\s*(?:per|\/)\s*[^.]+)?\.?/gi, '')
          .replace(/\s*Price:\s*Free\.?/gi, '')
          .replace(/\bHuman Agents?\s+digital twins\b/gi, 'Human Agents (Digital Twins)')
          .replace(/\bHuman Agents?\s+digital twin\b/gi, 'Human Agent (Digital Twin)')
          .replace(/\bpractitioners with digital twins\b/gi, 'practitioners with Digital Twin models')
          .replace(/\bdigital twins\b/gi, 'Human Agents')
          .replace(/\bdigital twin\b/gi, 'Human Agent')
          .replace(/\bexpert twins\b/gi, 'Human Agents')
          .replace(/\bexpert twin\b/gi, 'Human Agent')
          .replace(/\bHuman Agents?\s+Human Agents\b/gi, 'Human Agents')
          .replace(/\bHuman Agent\s+Human Agent\b/gi, 'Human Agent')
          .replace(/\s*in Neo4j\b/gi, '')
          .replace(/\bNeo4j\s*/gi, '')
          .trim();
        descriptionMap.set(toolKey.trim(), cleanDesc);
      }
    }

    if (descriptionMap.size === 0) {
      console.log('[sync-descriptions] No descriptions mapped from Airtable records — skipping');
      process.exit(0);
    }

    const toolHandlersPath = path.resolve(__dirname, '../src/toolHandlers.ts');
    let src = fs.readFileSync(toolHandlersPath, 'utf8');
    let updatedCount = 0;

    for (const [toolName, newDesc] of descriptionMap.entries()) {
      const escapedDesc = newDesc.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      const regex = new RegExp(`(server\\.tool\\(\\s*['"]${toolName}['"]\\s*,\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)`, 'g');
      const match = regex.exec(src);
      if (match) {
        const currentDescLiteral = match[2] || '';
        const currentUnquoted = currentDescLiteral.slice(1, -1);
        // Preserve canonical "Use when ..." job-first routing descriptions if the Airtable row hasn't been migrated to "Use when ..." yet
        if (currentUnquoted.startsWith('Use when ') && !newDesc.startsWith('Use when ')) {
          continue;
        }
        // Preserve BYO-MCP persistence clause if missing from Airtable description
        if (toolName === 'finalize_byo_mcp_onboarding' && !newDesc.includes('Profile is saved once terms are accepted; MCP details are verified and submitted for review here.')) {
          continue;
        }
        // Preserve get_capabilities canonical routing and view documentation
        if (toolName === 'get_capabilities') {
          continue;
        }
        src = src.replace(regex, (m, p1) => `${p1}'${escapedDesc}'`);
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      fs.writeFileSync(toolHandlersPath, src, 'utf8');
      console.log(`[sync-descriptions] Updated ${updatedCount} tool description(s) in src/toolHandlers.ts from Airtable`);
    } else {
      console.log('[sync-descriptions] No matching tool handler descriptions updated');
    }
  } catch (err) {
    console.warn(`[sync-descriptions] Sync encountered an error: ${err.message} — skipping`);
  }
}

sync();
