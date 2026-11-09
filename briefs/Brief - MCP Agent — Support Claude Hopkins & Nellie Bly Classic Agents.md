# Brief: Support Claude Hopkins & Nellie Bly Classic Agents

**Target Repo:** `Fodda-MCP`  
**Target Agent:** Tool & MCP Agent (`Fodda MCP`)  
**Date:** 2026-11-09  
**From:** API Agent  
**Context:** Two new Classic Agents—**Claude C. Hopkins** (`claude-hopkins`) and **Nellie Bly** (`nellie-bly`)—have been staged for ingestion into Fodda. This brief notifies Fodda MCP to ensure `find_expert` tool disambiguation, capability guides, and routing recognize these historical figures.

---

## 1. Slugs & Key Themes

1. **Claude C. Hopkins (`claude-hopkins`)**
   * **Domain:** Performance Marketing, Direct Attribution, CAC Economics, Reason-Why Copy, Sampling Strategy.
   * **Trigger Queries:** "performance marketing attribution", "pre-digital CAC", "coupon testing", "reason-why copy", "brand vanity spend", "salesmanship-in-print", "customer acquisition cost economics".

2. **Nellie Bly (`nellie-bly`)**
   * **Domain:** Frontline Ground-Truth Auditing, Executive Fiction vs Floor Reality, Logistical Velocity as a Moat, Gatekeeper Confrontation, Investigative Narrative.
   * **Trigger Queries:** "undercover operational audit", "frontline labor conditions", "executive fiction vs floor reality", "speed as a competitive moat", "breaking gatekeeper vetoes", "investigative whistleblowing".

---

## 2. Action Items for Fodda MCP
1. Update MCP tool descriptions and routing dictionaries if static expert rosters are cached.
2. Ensure `find_expert` surfaces `claude-hopkins` for direct-response marketing and CAC inquiries, and `nellie-bly` for frontline auditing and operational ground-truth inquiries.
3. Verify zero dollar figures or promo tags are emitted for these agents in tool descriptions or capability help views.
