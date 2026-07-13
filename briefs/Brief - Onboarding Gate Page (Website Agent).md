# Brief — Onboarding Gate Page (Website Agent)

> **Context:** This is a sub-brief decomposed from `Brief - Onboarding as a Connector (MASTER · MCP Agent coordinates).md`.
> **Target repo:** `Fodda Website` (specifically the gate page and `JoinExperts.tsx`).
> **Sequencing:** Do this in PARALLEL with the API and MCP work. It is mostly independent.

**Status:** Ready for Website Agent pickup.

## 1. Goal

Your objective is to update the onboarding web flow to push users towards the Claude MCP Connector path. You will build a gate page that allows users to sign up, provisions their MCP credentials, and hands them the connector link and instructions.

## 2. Work Required

### A. Sign-up Gate (`pages/JoinExperts.tsx`)
Create a divergence in the onboarding wizard to handle "Claude user" vs. "Other systems" sign-ups.
- You can likely use a toggle to choose the path.
- Both paths will still authenticate underneath via Clerk (Google or LinkedIn) reusing `handleOAuth`.

### B. Claude User Gate Page
When a user signs up as a Claude user and their credentials are provisioned (`lookupExpertMcpCreds`), route them to a new dedicated page containing:
1. **Connector Add Link:** Display "Add Fodda As A Connector Now". Provide the `mcpUrl` (with `user_id`) and the one-click `claudeConnectorUrl` deep-link. Reuse the exact pattern already present on `pages/Connect.tsx`.
2. **Prompt Instructions (CRITICAL FIX):** Instruct the user to write: *"Onboard me as a Fodda expert"*. 
   - **Do NOT** build a `claude.ai/new?q=` web pre-fill link. This feature was removed by Anthropic for security.
   - **Instead:** Make the phrase a **copy-to-clipboard button** so the user can easily paste it into Claude.
   - **Optional:** You may additionally provide a `claude://` desktop deep link as a bonus, but the primary mechanism must be copy/paste.

## 3. Implementation Details
- Non-Claude sign-ups continue into the existing web wizard without changes.
- Ensure the user's `user_id` is successfully stamped in the `mcpUrl`.
