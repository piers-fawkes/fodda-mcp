# API Integration Brief: Universal Graph & Skill Toggling

## Objective
Provide a unified endpoint in the Fodda API (`https://api.fodda.ai`) to allow users to permanently enable or disable **any knowledge graph, supplemental data source, or skill** (e.g., Paralogy) from chat interfaces.

## Context
Currently, users can only toggle graphs and skills via the Fodda Web App (`app.fodda.ai`), which directly updates the `disabledGraphs` field in the Airtable User record. The Fodda MCP server has no way to do this because the core Fodda API lacks an endpoint for modifying this specific user preference.

To allow the MCP agent to toggle these settings on the user's behalf, the Fodda API must expose this capability.

## Requirements for the API Agent

### 1. Airtable Helper Function (`functions/tracking/airtable.ts`)
Create or modify a helper function to update the user's `disabledGraphs` field.
- **Target Field**: `"disabledGraphs"` on the User table.
- **Format**: A comma-separated string of IDs.

### 2. New Endpoint (`functions/v1/v1Router.ts`)
Implement a new POST endpoint, for example `POST /v1/user/preferences/toggle`.

**Expected Payload:**
```json
{
  "target_id": "paralogy", // The ID of the graph, skill, or supplemental source
  "enabled": false         // true to enable (remove from disabled list), false to disable (add to list)
}
```

**Execution Logic:**
1. **Retrieve current state**: Read the user's current disabled graphs. (Note: The auth middleware already populates `(req as any).foddaDisabledGraphs` as a `Set<string>`).
2. **Mutate**:
   - If `enabled` is `false`, add `target_id` to the disabled set.
   - If `enabled` is `true`, remove `target_id` from the disabled set.
3. **Persist**: Convert the mutated set back to a comma-separated string and save it to Airtable using the helper function.
4. **Respond**: Return a success message and the updated array of disabled graphs so the client can sync its state.

### 3. Security & Validation
- Ensure the endpoint is protected by the standard API key authentication.
- Validate that `target_id` is a non-empty string and `enabled` is a boolean.

## Next Steps for MCP Agent (Post-API Deployment)
Once the API endpoint is live, the MCP agent will:
1. Implement a new tool `toggle_graph_preference` in `src/toolHandlers.ts` that sends requests to this new API endpoint.
2. Update the system prompt to guide the LLM to use this tool whenever a user asks to turn a graph, data source, or skill on or off.
