<div align="center">
  <img src="https://ucarecdn.com/6e7893d7-6b14-426b-83bc-574a3f72d6bc/foddaminilogo.png" alt="Fodda Logo" width="80"/>

  # Fodda — VS Code Extension

  **Connect your AI agent to Fodda knowledge graphs via MCP.**

  One-click setup for Cursor, Windsurf, and any VS Code fork.

</div>

---

## What Is Fodda?

Fodda is an AI context layer. It turns expert-curated research into structured knowledge graphs that AI systems can query — covering retail, beauty, fashion, sports, culture, and dozens of specialist domains. Instead of generic web search, your agent gets named-expert intelligence with full source attribution.

This extension makes it easy to connect Fodda to your IDE without manually constructing MCP URLs or navigating config files.

---

## Quick Start

1. **Install the extension** from Open VSX (or install the `.vsix` manually)
2. **Run the command**: `Cmd+Shift+P` → `Fodda: Connect to MCP`
3. **Enter your credentials** when prompted:
   - Your **Fodda API key** (starts with `fk_live_` or `sk_live_` — get one at [app.fodda.ai](https://app.fodda.ai))
   - Your **Fodda account email**
4. **The MCP URL is copied to your clipboard.** Paste it into your IDE's MCP settings (see below).

---

## Setup by IDE

### Cursor

1. Open **Settings** → **Features** → **MCP Servers**
2. Click **Add**
3. Paste the Fodda MCP URL from your clipboard
4. Save — Cursor will connect automatically

### Windsurf

1. Open **Settings** → **Cascade** → **MCP Servers**
2. Click **Add**
3. Paste the Fodda MCP URL from your clipboard
4. Save — Windsurf will connect automatically

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fodda": {
      "url": "https://mcp.fodda.ai/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Web (Pro / Max / Team / Enterprise)

1. Go to [claude.ai/customize/connectors](https://claude.ai/customize/connectors) or **Customize** → **Connectors**
2. Click the **+** button
3. Paste the MCP URL
4. Leave OAuth fields **blank** (Fodda uses API key auth)
5. Click **Add**

---

## Features

| Feature | Description |
|---------|-------------|
| **Connect Command** | `Fodda: Connect to MCP` — builds the MCP URL, copies to clipboard, shows setup instructions |
| **Settings Integration** | API key and email stored in VS Code settings (`fodda.apiKey`, `fodda.userEmail`) |
| **Status Bar Indicator** | Shows connection state — green when configured, grey when not. Click to connect. |
| **Output Channel** | Full MCP URL and IDE-specific setup steps in the Fodda output panel |

---

## Configuration

| Setting | Description |
|---------|-------------|
| `fodda.apiKey` | Your Fodda API key (`fk_live_...` or `sk_live_...`) |
| `fodda.userEmail` | The email address on your Fodda account |

You can set these in **Settings** (`Cmd+,`) → search "Fodda", or let the Connect command prompt you inline.

---

## Access & Pricing

### With an API Key (Recommended)
1. Go to [app.fodda.ai](https://app.fodda.ai)
2. Navigate to **Account** → **MCP Integration**
3. Copy your API key

New users get a **free Base plan** to get started. When your API calls run out, you can top up instantly — via pay-as-you-go metered billing, a one-time purchase via inline Stripe Checkout right from your IDE, or a plan upgrade.

### Without an API Key (Agent Pay-Per-Query)
AI agents backed by a [Stripe Link wallet](https://link.com/agents) can query Fodda **without any account or API key**:
- Send `X-Stripe-SPT: spt_xxx` header with any REST API request
- Charged per-query — no signup, no subscription
- Learn more: [Stripe Agentic Commerce](https://docs.stripe.com/agentic-commerce)

### Payment Channels

| Channel | Best For |
|---|---|
| **Free Base Plan** | Getting started |
| **Paid Plans** | Teams and power users |
| **Lava PAYG** | Developers with metered usage |
| **Top-Up** | Quick refill via Stripe Checkout |
| **Agent Pay-Per-Query** | Zero-onboarding agent access via SPT |

See [fodda.ai/pricing](https://www.fodda.ai/pricing) for current pricing.

---

## Links

- **App**: [app.fodda.ai](https://app.fodda.ai)
- **Documentation**: [docs.fodda.ai](https://docs.fodda.ai)
- **Pricing**: [fodda.ai/pricing](https://www.fodda.ai/pricing)
- **Support**: piers.fawkes@psfk.com

---

## License

Proprietary — [fodda.ai](https://www.fodda.ai)
