# Fodda MCP — To-Dos (Ready to Activate)

These are strategic initiatives that leverage the Waverunner autonomous sandbox. The underlying Google technology is currently available, making these ready for active development.

---

## 1. The Autonomous SDR (Sales Agent)
**Status:** Ready to activate
**What:** Transition the rigid Slack/Airtable sales bot into a persistent Waverunner agent. Give it tools to read the CRM, query Fodda, and draft hyper-personalized nurture emails. It will autonomously research leads and post draft emails to Slack for human approval.
**Brief:** Reference `brief_autonomous_sdr.md` in the artifacts.

## 2. The Autonomous Editor (Scheduled Briefings)
**Status:** Ready to activate
**What:** Transform the nightly Neo4j "data dump" into a curated editorial product. A nightly Waverunner job reads the raw signals, synthesizes a narrative "Editor's Note" tying them together, and outputs a clean HTML newsletter.
**Brief:** Reference `brief_autonomous_editor.md` in the artifacts.

## 3. The Autonomous Data Analyst (Internal Tool)
**Status:** Ready to activate
**What:** Build an internal Fodda capability where the team can ask an agent to run data analysis. E.g., "Analyze token usage over the last 30 days vs Expert Graph trial conversions." The agent autonomously writes Python, generates charts, and returns the analysis.

## 4. Enterprise BYOD (Bring Your Own Data) Integration
**Status:** Ready to activate (Egress Proxies currently supported)
**What:** Spin up Waverunner environments for enterprise clients that securely use the Waverunner Egress Proxy to attach their private API keys (e.g., Salesforce, Confluence) to requests. Allows Fodda LLMs to cross-reference public Fodda data with private enterprise data without the LLM ever "seeing" the private keys.
