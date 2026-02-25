# Fodda MCP Description Updates

## Summary
Updated all tool descriptions and server metadata to production-ready language that emphasizes strategic value, expert curation, and provenance. These are cosmetic-only changes with no functional modifications.

---

## 🔹 Tool Description Updates

### 🔎 **search_graph**
**Before:**
> Perform hybrid (vector + keyword) search on a Fodda knowledge graph. Returns trends and articles matching the query. Uses a 3-tier fallback: vector search → keyword search → all trends. Always returns results.

**After:**
> Search across expert-curated PSFK knowledge graphs (Retail, Beauty, Sports and partner datasets) to retrieve structured trend clusters, signals, and supporting articles relevant to a query.

---

### 🧭 **get_neighbors**
**Before:**
> Traverse the graph from seed nodes to find related concepts and relationships. Useful for depth-first discovery.

**After:**
> Explore how a trend, brand, or technology connects to related signals, concepts, and adjacent innovation patterns within the selected graph. Traversal is depth-limited for focused discovery.

---

### 📚 **get_evidence**
**Before:**
> Get source signals, articles, and evidentiary depth for a specific node. Essential for provenance and fact-checking.

**After:**
> Retrieve supporting signals, source articles, and structured evidence for a specific trend or concept. Designed for provenance, validation, and strategic briefing.

---

### 🧩 **get_node**
**Before:**
> Directly retrieve metadata and properties for a single node by its ID.

**After:**
> Retrieve the full metadata and properties of a specific node within the knowledge graph, including labels and structured attributes.

---

### 🏷 **get_label_values**
**Before:**
> Discover valid values for a specific node label (e.g., RetailerType, Technology). Use for discovery, UI filters, and category exploration.

**After:**
> Discover available values for a specific category (e.g., Technology, Audience, RetailerType) to support structured filtering and exploration.

---

### 📈 **psfk_overview**
**Before:**
> Get a structured macro overview from the PSFK Graph. Returns up to 3 meta_patterns. Useful for top-level briefings before deeper exploration. At least one of 'industry' or 'sector' must be provided.

**After:**
> Generate a macro-level overview of a selected PSFK domain (e.g., Retail, Beauty, Sports), summarizing key meta-patterns and structured trend clusters for strategic briefing.

---

## 🔹 Parameter Description Updates

### **graphId** parameter (all applicable tools)
**Before:**
> The graph ID

**After:**
> Select which curated graph to query (e.g., 'retail', 'beauty', 'sports', 'psfk', 'sic', 'waldo').

This reinforces product identity and makes the parameter more self-documenting.

---

## 🔹 Server-Level Description Update

### **.well-known/mcp.json** endpoint
**Before:**
> Expert-curated knowledge graphs for AI agents — PSFK Retail, Beauty, Sports and more.

**After:**
> Fodda MCP — Expert-curated trend intelligence graphs exposed as structured context for AI agents.

Short. Strong. Specific.

---

## Files Modified
- `/src/tools.ts` - All tool descriptions and graphId parameters
- `/src/index.ts` - Server discovery endpoint description

## Impact
✅ **No functional changes** - All logic remains identical  
✅ **No breaking changes** - All schemas and parameters unchanged  
✅ **Enhanced discoverability** - More strategic, professional language  
✅ **Better brand positioning** - Emphasizes expert curation and strategic value  
✅ **Improved UX** - More informative parameter descriptions

## Next Steps
These changes are ready for deployment. The updated descriptions will appear:
- In Gemini's tool selection interface
- In the MCP Registry listing
- In the `/mcp/tools` endpoint
- In the `/.well-known/mcp.json` discovery endpoint
