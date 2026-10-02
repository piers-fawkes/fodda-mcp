# Fodda MCP Tool Schema & Result Guidelines

## Core Principles

1. **Tool Results Carry Data + One Human Next Step**
   - The `content[].text` returned to the MCP client must contain clean, human-readable status prose followed by structured JSON data.
   - Every tool result concludes with a clear, single next action directed at the human user (e.g., `👉 **Next Step:** ...`).
   - Never output imperative scripts or directives directed at the AI model inside tool result text.

2. **No Injected Directives or Bracketed Warnings in Result Text**
   - Never embed bracketed directive blocks such as `[IDENTITY WARNING]`, `[REQUIRED]`, `[SCHEDULING BEHAVIOR]`, or warning banners like `⚠️ NO RESEARCH PROFILE SET` inside tool return payloads.
   - Safety-tuned frontier models (such as Claude and ChatGPT) classify bracketed imperative directives embedded in tool outputs as potential prompt injections and will refuse to execute the flow.

3. **Behavioral Guidance Belongs in Tool Descriptions and System Prompts**
   - Guidance for how the model should behave, format outputs, or route queries belongs strictly in the tool's `description` property or in the system prompt (`src/systemPrompt.ts`).
   - Even in tool descriptions, phrase instructions as objective capability notes rather than coercive imperative scripts.

4. **Transparent, Consented User Profiling and Account Actions**
   - Never instruct the model to covertly probe or silently profile users to call `update_user_profile` without explicit consent.
   - The model may transparently offer to save research preferences and framing guidelines, and only invoke `update_user_profile` when the user agrees or asks.
   - Never infer acceptance or consent on silence ("Otherwise we're good").
   - Explicit consent gates (e.g. `termsAccepted` in `submit_basic_info`) must be strictly enforced at the first write step, and the relevant Terms and Privacy links must be surfaced directly in the tool response. Once accepted, subsequent tools relax duplicate consent prompts.

5. **Connector Return Parameters**
   - Unauthenticated or onboarding paths directing users to web portals (e.g., `https://www.fodda.ai/join-experts`) must include return/continuation parameters (`?return_to=connector&source=mcp`) so the user can easily resume their workflow in their AI client.

6. **Structured Errors & Machine-Readable Error Codes**
   - Onboarding and general tool errors maintain `isError: true` with human-readable prose explaining what happened, followed by a fenced JSON block:
     ```json
     {
       "error": {
         "code": "terms_required",
         "cause": "Terms not accepted yet.",
         "next_action": "Ask the expert to accept the Terms and Privacy Policy, then call submit_basic_info again."
       }
     }
     ```
   - Standard code set:
     - `credentials_missing`: 401 or missing connector authentication
     - `terms_required`: Terms of Service and Privacy Policy not accepted
     - `record_not_found`: No onboarding record found for caller
     - `research_needs_basic_info`: Research requested before basic info record exists
     - `themes_not_ready`: Topics/themes not generated yet
     - `questions_failed`: Interview questionnaire generation failure
     - `interview_slot_invalid`: Scheduling time outside 15 min–30 days window
     - `interview_already_scheduled`: Attempt to double-book an interview
     - `mcp_probe_failed`: Probe timeout or bad JSON-RPC on MCP endpoint
     - `mcp_auth_unsupported`: Non-'none' authentication method requested
     - `upstream_error`: General upstream error fallback
   - The `next_action` field describes the human expert's next step in plain English; agents relay it in their own words (no model-directed imperatives or "read verbatim").
   - `get_onboarding_status` outputs prose `**Where you are:** <status label>. **Next step for you:** <next_action>` with `next_tool` in the JSON block for the agent.
