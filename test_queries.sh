#!/bin/bash
# Test 3 queries end-to-end through the live MCP server
# Tests the workflow: search_graph → get_evidence → search_insights(types=all)

BASE_URL="https://fodda-mcp-7mopqjzhwq-uk.a.run.app"
API_KEY="${FODDA_API_KEY:-fk_live_QMVnE0kDWlvUPPvD71vF}"
USER_ID="test-workflow-user"

call_tool() {
    local TOOL_NAME="$1"
    local ARGS="$2"
    local LABEL="$3"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔧 $LABEL"
    echo "   Tool: $TOOL_NAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # MCP tool call via JSON-RPC over streamable HTTP
    RESPONSE=$(curl -s -X POST "${BASE_URL}/mcp?api_key=${API_KEY}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json, text/event-stream" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": 1,
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"${TOOL_NAME}\",
                \"arguments\": ${ARGS}
            }
        }" 2>/dev/null)
    
    # Parse out the text content, truncate for readability
    echo "$RESPONSE" | python3 -c "
import sys, json
try:
    lines = sys.stdin.read().strip().split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('data: '):
            line = line[6:]
        if not line or line == '':
            continue
        try:
            obj = json.loads(line)
            if 'result' in obj:
                content = obj['result'].get('content', [])
                for c in content:
                    if c.get('type') == 'text':
                        data = json.loads(c['text'])
                        # Print summary
                        if isinstance(data, dict):
                            if 'trends' in data:
                                trends = data['trends']
                                print(f'   ✅ Found {len(trends)} trends')
                                for t in trends[:5]:
                                    name = t.get('name', t.get('trend_name', 'unnamed'))
                                    score = t.get('relevance_score', t.get('semantic_score', 0))
                                    ev = t.get('evidence_count', 0)
                                    print(f'      • {name} (score: {score:.2f}, evidence: {ev})')
                            elif 'statistics' in data:
                                stats = data['statistics']
                                print(f'   ✅ Found {len(stats)} evidence items')
                                for s in stats[:5]:
                                    etype = s.get('type', s.get('evidenceType', '?'))
                                    snippet = s.get('value', s.get('snippet', s.get('text', '')))[:100]
                                    print(f'      • [{etype}] {snippet}')
                            elif 'evidence' in data:
                                ev = data['evidence']
                                print(f'   ✅ Found {len(ev)} evidence articles')
                                for e in ev[:3]:
                                    title = e.get('title', e.get('headline', 'untitled'))[:80]
                                    ct = e.get('contentType', 'article')
                                    print(f'      • [{ct}] {title}')
                            elif 'error' in data:
                                print(f'   ❌ Error: {data[\"error\"]}')
                            elif 'note' in data:
                                print(f'   ⏭️  {data[\"note\"]}')
                            else:
                                keys = list(data.keys())[:5]
                                print(f'   ✅ Response keys: {keys}')
                        else:
                            print(f'   ✅ Response: {str(data)[:200]}')
            elif 'error' in obj:
                print(f'   ❌ RPC Error: {obj[\"error\"]}')
        except json.JSONDecodeError:
            continue
except Exception as ex:
    print(f'   ⚠️  Parse error: {ex}')
" 2>/dev/null
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  FODDA MCP WORKFLOW TEST — 3 QUERIES                   ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ─── Query 1: customer service escalation from AI to human agent ───
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📌 QUERY 1: customer service escalation from AI to human agent"
echo "═══════════════════════════════════════════════════════════"

call_tool "search_graph" "{\"graphId\": \"retail\", \"query\": \"customer service escalation from AI to human agent\", \"userId\": \"${USER_ID}\"}" \
    "Step 1 — search_graph (retail)"

call_tool "search_insights" "{\"graph_id\": \"retail\", \"query\": \"customer service AI escalation human agent\", \"types\": \"all\", \"min_score\": 0.60, \"userId\": \"${USER_ID}\"}" \
    "Step 2.5 — search_insights(types=all) for curated evidence"

# ─── Query 2: AI Reputation Trust ───
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📌 QUERY 2: AI Reputation Trust"
echo "═══════════════════════════════════════════════════════════"

call_tool "search_graph" "{\"graphId\": \"retail\", \"query\": \"AI reputation trust\", \"userId\": \"${USER_ID}\"}" \
    "Step 1 — search_graph (retail)"

call_tool "search_graph" "{\"graphId\": \"sic\", \"query\": \"AI reputation trust brand perception\", \"userId\": \"${USER_ID}\"}" \
    "Step 1b — search_graph (SIC — cultural lens)"

call_tool "search_insights" "{\"graph_id\": \"retail\", \"query\": \"AI trust reputation brand\", \"types\": \"all\", \"min_score\": 0.60, \"userId\": \"${USER_ID}\"}" \
    "Step 2.5 — search_insights(types=all)"

# ─── Query 3: touch haptic physical body sensation ───
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📌 QUERY 3: touch haptic physical body sensation"
echo "═══════════════════════════════════════════════════════════"

call_tool "search_graph" "{\"graphId\": \"ce-design\", \"query\": \"touch haptic physical body sensation\", \"userId\": \"${USER_ID}\"}" \
    "Step 1 — search_graph (ce-design)"

call_tool "search_graph" "{\"graphId\": \"retail\", \"query\": \"haptic touch physical sensation retail experience\", \"userId\": \"${USER_ID}\"}" \
    "Step 1b — search_graph (retail — experiential lens)"

call_tool "search_insights" "{\"graph_id\": \"ce-design\", \"query\": \"haptic touch physical sensation body\", \"types\": \"all\", \"min_score\": 0.60, \"userId\": \"${USER_ID}\"}" \
    "Step 2.5 — search_insights(types=all)"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  TEST COMPLETE                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
