// Generate tools-manifest.json — the source of truth for the callable MCP tools.
// Parses tool name + description from src/toolHandlers.ts server.tool() registrations,
// and applies the curated bills_as / category maps. Re-run after adding/renaming tools:
//   node scripts/generate-tools-manifest.mjs
// Consumed by the API's Offerings-catalog seed so tool rows never drift from the MCP.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toolHandlersPath = path.resolve(__dirname, '../src/toolHandlers.ts');

const src = fs.readFileSync(toolHandlersPath, 'utf8');

// queryTypeCode each tool bills as (from its chargeQuery call). Omitted = free.
const BILLS_AS = {
  brand_tracker: 'brand_intelligence',
  deep_research_topic: 'deep_research_light/heavy',
  search_graph: 'topic_research',
  brainstorm_topic: 'brainstorm',
  read_url: 'url_as_prompt',
  discover_adjacent_trends: 'adjacent_trends',
  get_earnings_intelligence: 'earnings_intelligence',
  get_earnings_divergence: 'earnings_intelligence',
  consult_analyst: 'expert_agent',
  consult_human_agent: 'human_agent_consult',
  request_deliverable: 'skill_deliverable',
  get_supplemental_context: 'standalone_supplemental',
  get_evidence: 'standalone_evidence',
  search_statistics: 'standalone_statistics',
  search_insights: 'standalone_insights',
  get_domain_intelligence: 'domain_intelligence',
  get_expert_intelligence: 'expert_intelligence',
  get_report_intelligence: 'report_intelligence',
  get_company_earnings: 'earnings_company',
  draft_linkedin_post: 'linkedin_post',
  draft_linkedin_article: 'linkedin_article',
};

const CATEGORY = {
  brand_tracker: 'Brand', deep_research_topic: 'Research',
  search_graph: 'Search', search_insights: 'Search', search_statistics: 'Search',
  get_evidence: 'Graph', get_node: 'Graph', get_neighbors: 'Graph', get_label_values: 'Graph',
  get_supplemental_context: 'Supplemental',
  get_earnings_intelligence: 'Financial', get_earnings_divergence: 'Financial', get_company_earnings: 'Financial',
  consult_analyst: 'Expert', consult_human_agent: 'Expert', list_analysts: 'Expert', get_expert_intelligence: 'Expert',
  request_deliverable: 'Expert', check_deliverable_status: 'Status',
  brainstorm_topic: 'Ideation', discover_adjacent_trends: 'Ideation',
  read_url: 'Web', get_domain_intelligence: 'Intelligence', get_report_intelligence: 'Intelligence',
  generate_visual: 'Visual',
  draft_linkedin_post: 'Content', draft_linkedin_article: 'Content',
  list_graphs: 'Account', get_my_account: 'Account', sign_up_free_account: 'Account',
  update_user_profile: 'Account', toggle_graph_preference: 'Account', send_feedback: 'Account',
  manage_scheduled_reports: 'Account', check_research_status: 'Status', check_supplemental_status: 'Status',
};

const STR = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const unquote = (s) => {
  const q = s[0];
  let b = s.slice(1, -1);
  b = b.replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  return b;
};

const tools = [];
for (const seg of src.split('server.tool(').slice(1)) {
  const found = seg.match(STR);
  if (!found || found.length < 2) continue;
  const name = unquote(found[0]);
  if (!/^[a-z0-9_]+$/.test(name)) continue;
  const description = unquote(found[1]).replace(/\s+/g, ' ').trim();
  tools.push({
    name,
    kind: 'tool',
    bills_as: BILLS_AS[name] || 'free',
    category: CATEGORY[name] || 'Other',
    description,
  });
}
tools.sort((a, b) => a.name.localeCompare(b.name));

// ── Build-time Cost Silence Guard ──
const violations = [];
for (const t of tools) {
  if (/Price:\s*\$|\$\s?\d/i.test(t.description)) {
    violations.push(`Tool "${t.name}" contains price mention in description: "${t.description}"`);
  }
}

const systemPromptPath = path.resolve(__dirname, '../src/systemPrompt.ts');
if (fs.existsSync(systemPromptPath)) {
  const promptSrc = fs.readFileSync(systemPromptPath, 'utf8');
  if (/follow-ups cost less/i.test(promptSrc)) {
    violations.push('src/systemPrompt.ts contains legacy phrase "follow-ups cost less"');
  }
  if (/Price:\s*\$/i.test(promptSrc)) {
    violations.push('src/systemPrompt.ts contains "Price: $" mention');
  }
}

if (violations.length > 0) {
  console.error('\n❌ BUILD FAILED: Cost Silence Rule Violations Detected:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('\nAIRTABLE is the source of truth for pricing. MCP tool descriptions and system prompts must remain cost-silent.\n');
  process.exit(1);
}

const out = {
  generated_from: 'Fodda MCP src/toolHandlers.ts',
  note: 'Source of truth for callable MCP tools. Public pricing is hosted at https://fodda.ai/pricing.',
  count: tools.length,
  billable: tools.filter((t) => t.bills_as !== 'free').length,
  tools,
};
fs.writeFileSync(path.resolve(__dirname, '../tools-manifest.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote tools-manifest.json — ${tools.length} tools (${out.billable} billable, ${tools.length - out.billable} free) [Cost Silence Guard Passed]`);
