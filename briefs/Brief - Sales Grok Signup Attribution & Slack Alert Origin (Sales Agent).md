# Brief: Sales Signup Feeder Grok Attribution & Slack Origin Line

**Repo:** `Fodda Sales` (`~/Documents/Fodda Sales`)  
**Target Agent:** Sales Agent  
**Date:** 2026-09-18  

---

## 1. Objective
Ensure that signups originating from Grok Bot (and other MCP connectors) are properly identified in Streak CRM and Slack alerts with an explicit `📍 Origin:` line, rather than defaulting to `Access: 🌐 Self Demo`.

---

## 2. Context & Root Cause
Recent signup alerts in `#fodda-sales` appeared as:
```text
🔑 *New signup*
👤 richardhartell@gmail.com (Richard Hartell)
📊 Access: 🌐 Self Demo
📦 Streak box created → Self Demo
⏰ First prompts email queued (10 min)
📰 Newsletter seed queued
```
Root causes in `lib/signup_feeder.js`:
1. **0-Query Default:** When a new user has not executed an MCP query yet (`questions.length === 0`), line 255 hardcodes:
   ```javascript
   if (isConfirmed) {
     stage = 'Self Demo';
     primarySourceLabel = '🌐 Web App';
   }
   ```
   It completely ignores `f.apiUse` and `f.onboardingIntent` from the Airtable `Users` record.
2. **Missing Slack Origin Field:** The Slack message template (lines 409–417) does not print an `Origin:` or `Source:` line.
3. **Query Source Classification:** When queries arrive, lines 236–248 only look for `api-v1` or `webapp`/`web`, grouping all other query sources (`grok-brand-context`, `earnings-intelligence`) into generic `🔌 MCP`.

---

## 3. Files Expected to Change
- `lib/signup_feeder.js`
- `triggers.js`
- `slack_bot.js`

---

## 4. Implementation Details

### A. Update `lib/signup_feeder.js` Source & Stage Logic
1. **Differentiate 0-Query Signups by `apiUse` / `onboardingIntent`:**
   ```javascript
   const apiUseLower = (f.apiUse || '').toLowerCase();
   const intentLower = (f.onboardingIntent || '').toLowerCase();

   if (questions.length === 0) {
     if (apiUseLower.includes('grok') || intentLower === 'grok') {
       stage = 'Grok Tester';
       primarySourceLabel = '🤖 Grok Bot';
       stageEmoji = '🤖';
     } else if (apiUseLower.includes('claude')) {
       stage = 'MCP Tester';
       primarySourceLabel = '🔌 Claude MCP';
       stageEmoji = '🔌';
     } else if (apiUseLower.includes('chatgpt')) {
       stage = 'ChatGPT Tester';
       primarySourceLabel = '💬 ChatGPT';
       stageEmoji = '💬';
     } else if (isConfirmed) {
       stage = 'Self Demo';
       primarySourceLabel = '🌐 Web App';
       stageEmoji = '🌐';
     }
   }
   ```
2. **Recognize Grok Sources in Query History:**
   ```javascript
   if (primarySource === 'grok-brand-context' || primarySource === 'earnings-intelligence') {
     stage = 'Grok Tester';
     primarySourceLabel = primarySource === 'earnings-intelligence' ? '🤖 Grok (Earnings)' : '🤖 Grok (Brand Context)';
     stageEmoji = '🤖';
   }
   ```
3. **Add `📍 Origin:` to Slack Message (`createdNotifications`):**
   ```javascript
   const slackMsg = [
     `🔑 *New signup*`,
     `👤 ${email} (${resolvedName})`,
     `📊 Access: ${stageEmoji} ${stage}`,
     `📍 Origin: ${primarySourceLabel}`,
     `📦 Streak box created → ${stage}`,
     latestPrompt ? `💬 Latest prompt: "${latestPrompt.substring(0, 100)}"` : '',
     followUpArmed ? `⏰ First prompts email queued (10 min)` : '',
     newsletterArmed ? `📰 Newsletter seed queued` : '',
   ].filter(Boolean).join('\n');
   ```

### B. Update `triggers.js` (Trigger 1) & `slack_bot.js`
In `triggers.js` line 196, recognize Grok in `sourceText`:
```javascript
if (f.apiUse?.toLowerCase().includes('grok') || f.onboardingIntent === 'grok') {
  sourceText = `🤖 Grok Bot (${f.apiUse || 'xAI Marketplace'})`;
}
```

---

## 5. Verification Plan
1. Run `node lib/signup_feeder.js --dry --verbose --hours 48`.
2. Verify that users with `apiUse: "Grok Bot"` display `📊 Access: 🤖 Grok Tester` and `📍 Origin: 🤖 Grok Bot`.
3. Verify existing Web App and API signups continue to route properly to `Self Demo` and `API Tester`.
