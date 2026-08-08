# Brief: Expert Research Framing, Peer Agent Handoffs & Credit Exhaustion Messaging (API Agent)

> **For:** Fodda API Agent
> **Priority:** High

---

## Executive Summary

Implement the approved conversational framing, peer Human Agent handoff prompting, and credit exhaustion rules across the Fodda API Digital Twin system prompts and consultation endpoints (`POST /v1/human-agents/consult` and `POST /v1/analysts/consult`).

---

## Requirements

### 1. Fodda Graph Research Framing
When a Digital Twin / Synthetic Analyst conducts a multi-graph search or supplemental sweep beyond their core domain:
- **Fodda Graph Search**: The expert must explicitly state:
  > *"I decided to do more research via Fodda graphs, and I found..."*
- **Peer Expert Consultation**: When querying or referencing another expert's graph, the expert must explicitly state:
  > *"I spoke to Human Agent [Name] and they shared..."*

### 2. Frictionless Peer Human Agent Handoff Prompting
Whenever a peer Human Agent is cited in research or recommended in referrals, append the conversational invitation:
> *"Would you like to connect with Human Agent [Name] directly? Just mention their name in your next message."*

### 3. Credit Exhaustion Framing & Messaging

#### Scenario A: Pre-Execution Credit Check (Zero Credits / Deep Sweep Attempt)
When a user attempts a deep multi-graph sweep but has 0 credits or exhausted research limits, return:
> *"I'd love to help analyze this macro shift with additional insights in the Fodda graph, but I noticed your account is currently out of research credits. While you can still keep asking me questions, if you want to get deeper insights you can quickly top up your balance at https://fodda.ai/account/billing to continue our consultation."*

#### Scenario B: Partial Yield Execution (Primary Analysis Delivered + Upgrade Note)
When primary analysis succeeds (Pass 1) but supplemental sweeps fail due to credit limits, deliver Pass 1 and set `partial_credit_warning`:
> *"I completed our primary macro signal analysis above. To let you know, I attempted to run an expanded quantitative sweep across corporate earnings filings in the Fodda graph, but noticed your account is out of supplemental research credits. While you can still keep asking me questions, if you want to get deeper insights You can top up at https://fodda.ai/account/billing to unlock full cross-graph sweeps."*

---

## Verification Criteria

1. Unit tests pass cleanly for `functions/v1/humanAgents.ts` and `functions/v1/analysts.ts`.
2. Live consultation checks verify 1st-person Fodda graph research phrasing, peer handoff prompting, and exact credit exhaustion envelopes.
