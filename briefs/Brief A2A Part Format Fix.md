# Brief: A2A Part Format Compatibility Fix

**Priority:** Urgent  
**Agent:** MCP  
**File:** `src/a2aHandler.ts`

---

## Problem

Fodda was registered on **Google Gemini Enterprise A2A** on 2026-05-17.

- Agent ID: `5017368423920345753`
- Engine: `fodda_1779044845082`
- Project: `gen-lang-client-0972731824`
- State: **ENABLED**

The A2A endpoint at `POST https://mcp.fodda.ai/a2a` is live but **only accepts message parts with `kind: 'text'`** (line 282). Google's A2A routing and other registries may send parts in different formats:

| Format | Example | Currently works? |
|---|---|---|
| `kind` (A2A v1.0 spec) | `{ kind: "text", text: "..." }` | ✅ Yes |
| `type` (Google variant) | `{ type: "text", text: "..." }` | ❌ **No** — returns error |
| Bare (minimal) | `{ text: "..." }` | ❌ **No** — returns error |

When Google routes an inbound A2A call to Fodda and uses `type` instead of `kind`, the handler rejects it with:

```json
{"jsonrpc":"2.0","error":{"code":-32602,"message":"Invalid params: no text part found in message"}}
```

---

## Fix

### 1. Update `A2APart` interface (line 31)

```typescript
// BEFORE:
interface A2APart {
    kind: 'text' | 'data' | 'file';
    text?: string;
    data?: any;
    mimeType?: string;
}

// AFTER:
interface A2APart {
    kind?: 'text' | 'data' | 'file';   // A2A v1.0 spec — now optional
    type?: 'text' | 'data' | 'file';   // Google / older A2A variants
    text?: string;
    data?: any;
    mimeType?: string;
}
```

### 2. Update text part finder (line 282)

```typescript
// BEFORE:
const textPart = message.parts.find(p => p.kind === 'text' && p.text);

// AFTER:
const textPart = message.parts.find(p => {
    if (!p.text) return false;
    // Accept all three variants:
    if (p.kind === 'text') return true;           // A2A v1.0 spec
    if (p.type === 'text') return true;           // Google variant
    if (!p.kind && !p.type) return true;          // Bare { text: "..." }
    return false;
});
```

---

## Test

Before fix (should fail):
```bash
curl -s -X POST https://mcp.fodda.ai/a2a \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","params":{"message":{"role":"user","parts":[{"text":"test"}]}},"id":"1"}'
```

After fix (should return a valid task response, not an error):
```bash
# All three should work:

# Bare format
curl -s -X POST https://mcp.fodda.ai/a2a \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","params":{"message":{"role":"user","parts":[{"text":"test"}]}},"id":"1"}'

# Google format
curl -s -X POST https://mcp.fodda.ai/a2a \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","params":{"message":{"role":"user","parts":[{"type":"text","text":"test"}]}},"id":"2"}'

# A2A v1.0 format (already works)
curl -s -X POST https://mcp.fodda.ai/a2a \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"test"}]}},"id":"3"}'
```

---

## Deploy

```bash
gcloud run deploy fodda-mcp --source . --region us-central1
```

Then re-run all three curl tests against production.
