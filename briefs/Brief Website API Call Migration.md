# Brief: API Call Terminology Migration — Fodda Website

**Date:** 2026-04-26  
**From:** MCP Agent  
**To:** Website Agent  
**Priority:** Low — deploy last  
**Context:** Fodda is renaming "tokens" to "API calls" across all user-facing surfaces. The website needs copy updates on pricing, docs, and marketing pages.

---

## What You Need To Do

### 1. Pricing Page

Update all plan descriptions to use "API calls" instead of "tokens":

| Plan | New Description |
|------|-----------------|
| Trial | 50 API calls to explore Fodda's intelligence |
| Base (Free) | 100 API calls/month across all expert graphs |
| PRO | 500 API calls/month with priority support |
| Top-Up | 100 additional API calls ($X) |

### 2. Feature Descriptions

Update any feature copy that references token costs:

| Feature | New Copy |
|---------|----------|
| Topic Research | "15 API calls per query" |
| Brand Intelligence | "20 API calls per query" |
| Deep Research | "20–30 API calls depending on depth" |
| Weekly Briefing | "20 API calls per scheduled run" |
| URL as Prompt | "15 API calls per query" |

### 3. Documentation Pages

- `llms.txt` — Update any token references
- API docs / QuickStart — "tokens" → "API calls"
- README if published on the website

### 4. Search & Replace

Safe to do a global search for "token" in user-facing copy files. Be careful to NOT rename:
- Authentication tokens (JWT, API tokens)
- Internal code references
- Cookie/session token references

---

## Deploy Last

This is purely a copy change with no backend dependencies. Deploy after API and App are live.
