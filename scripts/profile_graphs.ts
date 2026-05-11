import { GoogleGenAI, Type } from '@google/genai';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const FODDA_API_KEY = process.env.FODDA_API_KEY || 'sk_live_fodda';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_BASE = process.env.FODDA_API_URL || 'https://api.fodda.ai';

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is required to run the Waverunner Profiler.');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Fodda API Helper
async function foddaRequest(method: string, path: string, body?: any) {
    const url = `${API_BASE}${path}`;
    const headers = { 'X-API-Key': FODDA_API_KEY, 'Content-Type': 'application/json' };
    try {
        const resp = method === 'POST' ? await axios.post(url, body, { headers }) : await axios.get(url, { headers });
        return resp.data;
    } catch (err: any) {
        console.error(`Fodda API Error (${path}):`, err.response?.data || err.message);
        throw err;
    }
}

// Define the precise output schema expected for the CSV/Airtable sync
const ProfileSchema = {
    type: Type.OBJECT,
    properties: {
        agent_prompt: { 
            type: Type.STRING, 
            description: "CRITICAL ROUTING INSTRUCTION: 2 sentences telling an LLM exactly what queries this graph solves. MUST start with 'CRITICAL: Use this graph for...' or 'CRITICAL: Only use this graph for...'"
        },
        whatItDoesText: { 
            type: Type.STRING, 
            description: "The Perspective: 3-4 sentences of deep editorial summarizing the overarching themes, anomalies, and unique value of the data."
        },
        keyFeatures: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "Utility: 3-5 bullet points of structural utilities (e.g. 'Maps 50+ emerging materials')."
        },
        forTeamsLike: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "Target Audiences: 3 specific roles/teams that would benefit most (e.g. 'Automotive R&D')."
        },
        example_queries: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "3 highly-effective sample questions based on actual evidence found in the graph."
        },
        curatorURL: { 
            type: Type.STRING, 
            description: "The website URL of the publisher or curator. Use google_search to find it if not obvious."
        },
        topics: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "3-5 high-level canonical tags (e.g., 'Sustainability', 'Gen Z')."
        },
        geography: { 
            type: Type.STRING, 
            description: "Geographic coverage based on evidence locations (e.g., 'Global', 'North America', 'APAC')."
        },
        byTheNumbers: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            description: "3 hard statistics or quantitative data points extracted exactly from the graph evidence."
        },
        headline: { 
            type: Type.STRING, 
            description: "A punchy, 8-12 word marketing hook for the website card."
        }
    },
    required: ["agent_prompt", "whatItDoesText", "keyFeatures", "forTeamsLike", "example_queries", "curatorURL", "topics", "geography", "byTheNumbers", "headline"]
};

// Define Fodda Tools for Waverunner
const toolsDeclaration: any = {
    functionDeclarations: [
        {
            name: 'search_graph',
            description: 'Search a specific Fodda knowledge graph to understand its contents and trends.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING }, graphId: { type: Type.STRING } },
                required: ['query', 'graphId']
            }
        },
        {
            name: 'search_statistics',
            description: 'Search for specific quantitative data points, numbers, and stats in a graph.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING }, graphId: { type: Type.STRING } },
                required: ['query', 'graphId']
            }
        }
    ]
};

async function executeTool(name: string, args: any) {
    if (name === 'search_graph') {
        const body = { query: args.query, limit: 10 };
        return await foddaRequest('POST', `/v1/graphs/${args.graphId}/search`, body);
    }
    if (name === 'search_statistics') {
        const params = new URLSearchParams();
        params.set('query', args.query);
        params.set('types', 'metric,quote,interpretation');
        params.set('limit', '10');
        params.set('min_score', '0.65');
        return await foddaRequest('GET', `/v1/graphs/${args.graphId}/statistics?${params.toString()}`);
    }
    throw new Error(`Unknown tool: ${name}`);
}

async function profileGraph(graph: any) {
    console.log(`\n======================================================`);
    console.log(`🔍 PROFILING GRAPH: ${graph.name} (${graph.graph_id})`);
    console.log(`======================================================`);

    const systemInstruction = `You are the Lead Fodda Knowledge Graph Profiler. 
Your objective is to thoroughly investigate the graph "${graph.name}" (ID: ${graph.graph_id}), curated by "${graph.curator || 'Fodda'}". 
Its current description is: "${graph.description || ''}".

Instructions:
1. You MUST call \`search_graph\` with broad queries like "overview", "main trends", or specific keywords derived from its description to see what's actually inside.
2. You MUST call \`search_statistics\` to extract hard numbers for the \`byTheNumbers\` field.
3. If you don't know the official website for "${graph.curator}", leave the URL blank.
4. Once you have enough context, return the final profile as a structured JSON object matching the exact schema provided.

The JSON output MUST EXACTLY match this shape (and no markdown formatting or \`\`\`json wrappers):
{
  "agent_prompt": "CRITICAL: Use this graph for...",
  "whatItDoesText": "...",
  "keyFeatures": ["...", "...", "..."],
  "forTeamsLike": ["...", "...", "..."],
  "example_queries": ["...", "...", "..."],
  "curatorURL": "...",
  "topics": ["...", "...", "..."],
  "geography": "...",
  "byTheNumbers": ["...", "...", "..."],
  "headline": "..."
}`;

    let contents = [{ role: 'user', parts: [{ text: `Begin profiling graphId: ${graph.graph_id}` }] }];
    let iterations = 0;
    
    while (iterations < 10) {
        iterations++;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: contents,
            config: {
                systemInstruction,
                tools: [toolsDeclaration],
                temperature: 0.2
            }
        });

        const funcCall = response.functionCalls?.[0];
        if (funcCall) {
            console.log(`   🛠️  Waverunner called ${funcCall.name}(${JSON.stringify(funcCall.args)})`);
            try {
                let toolResult;
                if (funcCall.name === 'search_graph' || funcCall.name === 'search_statistics') {
                    toolResult = await executeTool(funcCall.name, funcCall.args);
                } else {
                    toolResult = { error: 'Native tool not handled correctly, use Fodda tools.' };
                }
                
                contents.push({ role: 'model', parts: [{ functionCall: funcCall }] as any });
                contents.push({ 
                    role: 'function', 
                    parts: [{ functionResponse: { name: funcCall.name, response: toolResult } }] as any 
                });
            } catch (err: any) {
                console.log(`   ❌ Tool failed:`, err.message);
                contents.push({ role: 'model', parts: [{ functionCall: funcCall }] as any });
                contents.push({ role: 'function', parts: [{ functionResponse: { name: funcCall.name, response: { error: err.message } } }] as any });
            }
        } else {
            const jsonText = response.text || '{}';
            const cleanJson = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            console.log(`   ✅ Profiling complete.`);
            return JSON.parse(cleanJson);
        }
    }
    
    console.log(`   ⚠️ Max iterations reached.`);
    return null;
}

async function run() {
    console.log('Fetching graph registry...');
    const data = await foddaRequest('GET', '/v1/graphs');
    const graphs = data.graphs || [];
    console.log(`Found ${graphs.length} graphs to profile.`);
    
    const results = [];
    
    for (const g of graphs) {
        if (g.graph_type === 'user' || g.status !== 'live') continue;
        
        try {
            const profile = await profileGraph(g);
            if (profile) {
                results.push({ graphId: g.graph_id, graphName: g.name, ...profile });
            }
        } catch (err: any) {
            console.error(`❌ Failed to profile ${g.graph_id}:`, err.message);
        }
    }
    
    fs.writeFileSync('graph_profiles.json', JSON.stringify(results, null, 2));
    console.log(`\n🎉 Done! Wrote ${results.length} profiles to graph_profiles.json`);
}

run().catch(console.error);
