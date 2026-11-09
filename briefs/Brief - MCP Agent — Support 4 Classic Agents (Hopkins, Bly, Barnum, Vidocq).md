# Brief: Support 4 Classic Agents (Hopkins, Bly, Barnum, Vidocq)

**Target Repo:** `Fodda-MCP`  
**Target Agent:** MCP Agent (`Fodda MCP`)  
**Date:** 2026-11-09  
**From:** API Agent  
**Context:** Four new Classic Digital Twins covering major user query demand areas have been staged and wired into the API:
1. `claude-hopkins`: Performance marketing, attribution, CAC, sampling economics, reason-why copy specificity, vanity metrics auditing.
2. `nellie-bly`: Undercover operational auditing, frontline ground truth, floor reality vs. executive fiction, speed as competitive moat, breaking gatekeeper vetoes.
3. `pt-barnum`: Retail visual merchandising, storefront theater, attention architecture, exterior magnetism, curiosity loops (the brick-man), customer circulation ('the Egress'), and the ethics of the harmless humbug.
4. `eugene-francois-vidocq`: Adversarial security, criminal forensics, undercover infiltration, zero-trust, reformed threat actors, controlled delivery stings, and institutional corruption auditing ('the leather gloves rule').

---

## Action Items for MCP Agent
1. Update MCP tool manifests and prompt guidelines to recognize queries matching these 4 specialized domains and route to `claude-hopkins`, `nellie-bly`, `pt-barnum`, and `eugene-francois-vidocq`.
2. Ensure `ask_fodda` and expert routing logic properly recognize the 4 slugs.
3. Note pricing rule: The machine rate is 5 tokens (`tokenCost: 5`). Never show token rates to human users—display the published human USD price from Airtable.
