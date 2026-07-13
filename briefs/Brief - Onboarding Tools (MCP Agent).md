# Brief — Onboarding Tools (MCP Agent)

> **Context:** This is a sub-brief decomposed from `Brief - Onboarding as a Connector (MASTER · MCP Agent coordinates).md`.
> **Target repo:** `Fodda MCP` (building the onboarding tools).
> **Sequencing:** Do this SECOND. Wait for the API Agent to expose the spine endpoints first.

**Status:** Ready for MCP Agent pickup (pending API Agent completion).

## 1. Goal

Your objective is to build the MCP tools that enable the conversational "Onboarding as a Connector" flow in Claude. These tools are thin wrappers that call the backend endpoints exposed by the API Agent.

## 2. Work Required

Implement the following tools in the Fodda MCP connector:

- `begin_expert_onboarding`: Creates/loads the Analyst record and fetches the prompt strings from the new single-source endpoint.
- `submit_basic_info(name, role, knowledgeArea)`: Wraps the `/api/prepare-voice-interview` (or equivalent) endpoint to save basic info.
- `run_deep_research`: Kicks off the asynchronous Deep Research by calling `/api/deep-research`.
- `submit_expertise_analysis(voiceStudy, expertTopics)`: Wraps the `/api/prepare-voice-interview` endpoint to write `voiceStudyRaw` and `expertTopicsRaw`.
- `get_detected_themes`: Fetches the derived themes for the user to review.
- `confirm_themes(themes)`: Wraps the `/api/generate-questions` endpoint. **Note:** The theme-selection backend and `interviewQuestions` field are already shipped! This tool simply wraps the existing, working logic.
- `get_onboarding_status`: Wraps the status-read endpoint to fetch the `Status` field.
- ~~`get_my_earnings`~~ — **moved out of onboarding scope** (Piers, 2026-07-09): it's post-onboarding account admin, not onboarding. The tool already exists in `toolHandlers.ts` and stays wired, but its correctness/source is now tracked in `Brief - Expert Earnings Tool (API + MCP Agent).md`, not here.

## 3. Important Context & Constraints

1. **Wait for Endpoints:** Do not build the logic natively inside the MCP repo. You must call the endpoints provided by the Website/API repos.
2. **Scheduling Delegated:** The Step 5 `schedule_interview` tool is intentionally omitted from your build list. It has been successfully built and delegated via the companion Recall brief in the Website repo. It will be wired up independently; just be aware of its place in the flow.
3. **Identity & Auth:** The `user_id` passed to these tools must conform to `Brief MCP Identity and URL Scheme.md`. You must reconcile with that brief before implementing the tool payloads.
4. **Earnings:** split out — see `Brief - Expert Earnings Tool (API + MCP Agent).md`. (The built endpoint currently reads a guessed Airtable table instead of the SPT/payout ledger it was told to use; correcting that is the earnings brief's job, not this one's.)
