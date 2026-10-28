import assert from 'assert';
import { enrichVoice, enrichVoices, enrichEvidence, rankAndFilterEvidence, isVoiceItem } from './enrichment.js';
import { createServer } from './toolHandlers.js';
import { setCachedCatalogForTesting } from './catalogCache.js';
import fs from 'fs';

async function runVoicesSuite() {
    console.log('================================================================');
    console.log(' Running Verification: Voices & Perspective in MCP Tools Suite');
    console.log('================================================================\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Unit tests for enrichVoice, enrichVoices & guards
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: enrichVoice contract rendering rules ---');
    
    // 1.1 Failed voice is dropped
    const failedVoice = {
        id: 'voice-failed',
        quote: 'This should not appear',
        quote_kind: 'verbatim',
        claim: 'Failed claim',
        verified: 'failed',
        speaker: { name: 'John Doe', type: 'executive' }
    };
    assert.strictEqual(enrichVoice(failedVoice), null, 'Failed voice must return null');
    assert.deepStrictEqual(enrichVoices([failedVoice]), [], 'enrichVoices must filter out failed voices');

    // 1.2 link_only voice has quote: null
    const linkOnlyVoice = {
        id: 'voice-link',
        quote: 'Some long text that cannot be displayed under link_only',
        quote_kind: 'verbatim',
        claim: 'Link only claim',
        verified: 'verified',
        license: 'link_only',
        speaker: { name: 'Jane Smith', type: 'analyst' }
    };
    const enrichedLink = enrichVoice(linkOnlyVoice);
    assert.strictEqual(enrichedLink.quote, null, 'link_only voice must have quote: null');

    // 1.3 excerpt_only trimmed to <= 60 words
    const longQuote = Array(80).fill('word').join(' ');
    const excerptVoice = {
        id: 'voice-excerpt',
        quote: longQuote,
        quote_kind: 'verbatim',
        claim: 'Excerpt claim',
        verified: 'verified',
        license: 'excerpt_only',
        speaker: { name: 'Executive Alex', type: 'executive' }
    };
    const enrichedExcerpt = enrichVoice(excerptVoice);
    const wordCount = enrichedExcerpt.quote.replace(/\.\.\.$/, '').split(/\s+/).length;
    assert.ok(wordCount <= 60, `excerpt_only must be trimmed to <= 60 words (got ${wordCount})`);

    // 1.4 Verbatim quote is quotable
    const verbatimVoice = {
        id: 'voice-verb',
        quote: 'Direct verified quotation from the executive.',
        quote_kind: 'verbatim',
        claim: 'Direct quotation claim',
        verified: 'verified',
        license: 'full',
        speaker: { name: 'Satya Nadella', title: 'CEO', org: 'Microsoft', type: 'executive' }
    };
    const enrichedVerbatim = enrichVoice(verbatimVoice);
    assert.strictEqual(enrichedVerbatim.display.quotable, true, 'Verbatim verified quote must have display.quotable = true');
    assert.ok(enrichedVerbatim.formatted_citation.startsWith('"Direct verified quotation'), 'Verbatim quote must start with quotation mark');

    // 1.5 Paraphrase is NOT quotable and must NEVER have quotation marks
    const paraphraseVoice = {
        id: 'voice-para',
        quote: 'The company plans to expand retail operations next quarter.',
        quote_kind: 'paraphrase',
        claim: 'Retail expansion',
        verified: 'verified',
        license: 'full',
        speaker: { name: 'Retail Analyst', title: 'VP', org: 'Mintel', type: 'analyst' }
    };
    const enrichedPara = enrichVoice(paraphraseVoice);
    assert.strictEqual(enrichedPara.display.quotable, false, 'Paraphrase voice must have display.quotable = false');
    assert.ok(!enrichedPara.formatted_citation.startsWith('"'), 'Paraphrase citation must NEVER start with quotation mark');
    assert.ok(!enrichedPara.formatted_citation.includes('""'), 'Paraphrase citation must NEVER contain quotes around statement');

    // 1.6 Author thesis is NOT quotable
    const thesisVoice = {
        id: 'voice-thesis',
        quote: 'Brand gravity collapses when discounting becomes habitual.',
        quote_kind: 'author_thesis',
        claim: 'Discounting gravity trap',
        verified: 'verified',
        license: 'full',
        speaker: { name: 'Ben Dietz', type: 'founder' }
    };
    const enrichedThesis = enrichVoice(thesisVoice);
    assert.strictEqual(enrichedThesis.display.quotable, false, 'Author thesis voice must have display.quotable = false');
    assert.ok(!enrichedThesis.formatted_citation.startsWith('"'), 'Author thesis must NOT start with quotation mark');

    // 1.7 Separation: voices are never mixed into evidence[]
    assert.strictEqual(isVoiceItem(verbatimVoice), true, 'verbatimVoice is a voice item');
    assert.strictEqual(isVoiceItem({ title: 'Article 1', sourceUrl: 'https://example.com' }), false, 'Article is not a voice item');

    const mixedEvidence = [
        { title: 'Article A', sourceUrl: 'https://example.com/a' },
        verbatimVoice,
        { title: 'Article B', sourceUrl: 'https://example.com/b' }
    ];
    const cleanedEvidence = enrichEvidence(mixedEvidence);
    assert.strictEqual(cleanedEvidence.length, 2, 'enrichEvidence must filter out voice items');
    assert.ok(cleanedEvidence.every((e: any) => e.title.startsWith('Article')), 'evidence[] must only contain articles');

    const rankedEvidence = rankAndFilterEvidence(mixedEvidence, 'retail');
    assert.ok(rankedEvidence.every((e: any) => !isVoiceItem(e)), 'rankAndFilterEvidence must not include voices');
    console.log('✅ TEST 1 Passed: enrichVoice rules, quotation guards & evidence separation verified.\n');

    // ─────────────────────────────────────────────────────────────
    // Setup Mock Server for Tool Handler Tests
    // ─────────────────────────────────────────────────────────────
    setCachedCatalogForTesting(
        { version: '2.0.0', generated_at: new Date().toISOString(), graph_count: 1, graphs: [] },
        [
            {
                id: 'ben-dietz-sic',
                analyst_id: 'ben-dietz-sic',
                name: 'Ben Dietz',
                graphSubType: 'Digital Twin',
                is_human_agent: true,
                status: 'Active',
                credibility_anchor: "Ben Dietz's Human Agent on Fodda is an expert in brand culture strategy."
            },
            {
                id: 'brand-cmo',
                analyst_id: 'brand-cmo',
                name: 'Brand CMO',
                graphSubType: 'Synthetic Expert',
                status: 'Active',
                credibility_anchor: "Fodda's Brand CMO persona provides corporate executive marketing strategy."
            }
        ]
    );

    const requests: Array<{ method: string; path: string; body: any }> = [];

    const mockFoddaRequest = async (method: string, path: string, apiKey: string, userId: string, body: any) => {
        const req = { method, path, body };
        requests.push(req);

        if (path.includes('/evidence')) {
            return {
                node_id: body.for_node_id,
                evidence: [
                    { title: 'Store of the Future Opens', publication: 'Retail Dive', sourceUrl: 'https://example.com/article1' }
                ],
                voices: [
                    {
                        id: 'v-101',
                        quote: 'Pop-ups allow rapid physical experimentation.',
                        quote_kind: 'verbatim',
                        claim: 'Physical experimentation',
                        speaker: { name: 'Sarah Jenkins', title: 'VP Retail', org: 'Target', type: 'executive' },
                        verified: 'verified',
                        license: 'full',
                        stance: 'supports'
                    }
                ]
            };
        }

        if (path.includes('/v1/statistics') || path.includes('/statistics')) {
            return {
                total: 1,
                data: [
                    {
                        id: 'quote-42',
                        quote: 'Direct-to-consumer margins are stabilizing.',
                        voice: {
                            id: 'v-202',
                            quote: 'Direct-to-consumer margins are stabilizing.',
                            quote_kind: 'verbatim',
                            claim: 'DTC margins',
                            speaker: { name: 'Eileen Fisher', title: 'Founder', org: 'Eileen Fisher Inc', type: 'founder' },
                            verified: 'verified',
                            license: 'full',
                            stance: 'supports'
                        }
                    }
                ]
            };
        }

        if (path.includes('/v1/graphs/retail/search') || path.includes('/search')) {
            return {
                rows: [
                    {
                        node_id: '2507.0',
                        trendName: 'Pop Ups As Test Labs',
                        description: 'Temporary spaces testing concepts',
                        voices: [
                            {
                                id: 'v-303',
                                quote: 'We test 10 formats a year through ephemeral spaces.',
                                quote_kind: 'verbatim',
                                claim: 'Ephemeral retail velocity',
                                speaker: { name: 'Marcus Vance', title: 'Chief Experience Officer', org: 'Nordstrom', type: 'executive' },
                                verified: 'verified',
                                license: 'full',
                                stance: 'supports'
                            }
                        ]
                    }
                ],
                total: 1
            };
        }

        if (path.includes('/v1/human-agents/consult')) {
            return {
                result: 'Ben Dietz on brand gravity and cultural relevance.',
                coverage: 'FULL',
                sources_used: [],
                perspective: {
                    agent_slug: 'ben-dietz-sic',
                    agent_name: 'Ben Dietz',
                    agent_type: 'human_agent',
                    text: 'Ben Dietz on brand gravity and cultural relevance.',
                    generated_at: '2026-10-28T12:00:00Z',
                    label: "Perspective from Ben Dietz's Fodda agent"
                }
            };
        }

        if (path.includes('/v1/analysts/consult')) {
            return {
                result: 'Brand CMO evaluation of retail media network spending.',
                coverage: 'FULL',
                sources_used: [],
                perspective: {
                    agent_slug: 'brand-cmo',
                    agent_name: 'Brand CMO',
                    agent_type: 'agentic_expert',
                    text: 'Brand CMO evaluation of retail media network spending.',
                    generated_at: '2026-10-28T12:00:00Z',
                    label: "Perspective from Brand CMO persona"
                }
            };
        }

        return {};
    };

    const server = await createServer('test_api_key', 'test_user', mockFoddaRequest as any, async () => ({}), () => '', () => '');
    const tools = (server as any)._registeredTools;

    // ─────────────────────────────────────────────────────────────
    // TEST 2: get_evidence with view=articles, view=voices, view=both
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: get_evidence with view options ---');
    const getEvidenceHandler = tools['get_evidence'].handler;

    // 2.1 view=articles
    const resArticles = await getEvidenceHandler({ graphId: 'retail', for_node_id: '2507.0', view: 'articles' });
    const articlesData = JSON.parse(resArticles.content[0].text);
    const evReq1 = requests.find(r => r.path.includes('/evidence'));
    assert.strictEqual(evReq1?.body?.view, 'articles', 'Must pass view=articles to API');
    assert.ok(articlesData.evidence && articlesData.evidence.length > 0, 'view=articles must contain evidence');
    assert.strictEqual(articlesData.voices, undefined, 'view=articles must NOT contain voices block (matches today output)');

    // 2.2 view=voices
    requests.length = 0;
    const resVoices = await getEvidenceHandler({ graphId: 'retail', for_node_id: '2507.0', view: 'voices' });
    const voicesData = JSON.parse(resVoices.content[0].text);
    const evReq2 = requests.find(r => r.path.includes('/evidence'));
    assert.strictEqual(evReq2?.body?.view, 'voices', 'Must pass view=voices to API');
    assert.strictEqual(voicesData.evidence, undefined, 'view=voices must NOT contain evidence block');
    assert.ok(voicesData.voices && voicesData.voices.length > 0, 'view=voices must contain voices block');
    assert.strictEqual(voicesData.voices[0].speaker.name, 'Sarah Jenkins');

    // 2.3 view=both
    requests.length = 0;
    const resBoth = await getEvidenceHandler({ graphId: 'retail', for_node_id: '2507.0', view: 'both' });
    const bothData = JSON.parse(resBoth.content[0].text);
    const evReq3 = requests.find(r => r.path.includes('/evidence'));
    assert.strictEqual(evReq3?.body?.view, 'both', 'Must pass view=both to API');
    assert.ok(bothData.evidence && bothData.evidence.length > 0, 'view=both must contain evidence');
    assert.ok(bothData.voices && bothData.voices.length > 0, 'view=both must contain voices');
    console.log('✅ TEST 2 Passed: get_evidence correctly filters articles, voices, and both.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: search_insights returns voice.speaker.name & passes params
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: search_insights voice passing & parameter routing ---');
    requests.length = 0;
    const searchInsightsHandler = tools['search_insights'].handler;
    const resInsights = await searchInsightsHandler({
        query: 'DTC margins',
        speaker_types: 'founder,executive',
        stance: 'supports'
    });
    const insightsReq = requests.find(r => r.path.includes('/statistics'));
    assert.ok(insightsReq?.path.includes('speaker_types=founder%2Cexecutive'), 'speaker_types param must be passed to API');
    assert.ok(insightsReq?.path.includes('stance=supports'), 'stance param must be passed to API');

    const insightsData = JSON.parse(resInsights.content[0].text);
    const item = (insightsData.data || insightsData.insights || insightsData.results)[0];
    assert.ok(item.voice, 'search_insights item must carry voice object');
    assert.strictEqual(item.voice.speaker.name, 'Eileen Fisher', 'search_insights item must carry voice.speaker.name');
    assert.strictEqual(item.voice.display.quotable, true, 'Verbatim quote must have display.quotable=true');
    console.log('✅ TEST 3 Passed: search_insights passes speaker_types/stance and returns voice.speaker.name.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: search_graph carries voices[] and supports include_voices
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: search_graph include_voices flag & voices[] rows ---');
    requests.length = 0;
    const searchGraphHandler = tools['search_graph'].handler;

    const resGraphWithVoices = await searchGraphHandler({
        graphId: 'retail',
        query: 'pop up stores',
        include_voices: true
    });
    const graphReq1 = requests.find(r => r.path.includes('/search'));
    assert.strictEqual(graphReq1?.body?.include_voices, true, 'search_graph must pass include_voices=true to API');
    const graphData = JSON.parse(resGraphWithVoices.content[0].text);
    assert.ok(graphData.rows[0].voices, 'search_graph row must carry voices[]');
    assert.strictEqual(graphData.rows[0].voices[0].speaker.name, 'Marcus Vance');

    requests.length = 0;
    const resGraphWithoutVoices = await searchGraphHandler({
        graphId: 'retail',
        query: 'pop up stores',
        include_voices: false
    });
    const graphReq2 = requests.find(r => r.path.includes('/search'));
    assert.strictEqual(graphReq2?.body?.include_voices, false, 'search_graph must pass include_voices=false to API');
    const graphDataNoVoices = JSON.parse(resGraphWithoutVoices.content[0].text);
    assert.strictEqual(graphDataNoVoices.rows[0].voices, undefined, 'search_graph row with include_voices=false must not carry voices');
    console.log('✅ TEST 4 Passed: search_graph supports include_voices and attaches voices[] to rows.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: consult_human_agent and consult_analyst structuredContent.perspective
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 5: consult tools structuredContent.perspective and label line ---');
    const consultHumanHandler = tools['consult_human_agent'].handler;
    const resConsultHuman = await consultHumanHandler({
        analyst_id: 'ben-dietz-sic',
        query: 'What is your view on discounting?'
    });

    assert.ok(resConsultHuman.structuredContent?.perspective, 'consult_human_agent must return structuredContent.perspective');
    assert.strictEqual(resConsultHuman.structuredContent.perspective.label, "Perspective from Ben Dietz's Fodda agent");
    const humanText = resConsultHuman.content[0].text;
    assert.ok(humanText.includes("--- Perspective from Ben Dietz's Fodda agent ---"), 'consult text must label the response with perspective.label');

    const consultAnalystHandler = tools['consult_analyst'].handler;
    const resConsultAnalyst = await consultAnalystHandler({
        analyst_id: 'brand-cmo',
        query: 'How to allocate retail media budget?'
    });

    assert.ok(resConsultAnalyst.structuredContent?.perspective, 'consult_analyst must return structuredContent.perspective');
    assert.strictEqual(resConsultAnalyst.structuredContent.perspective.label, "Perspective from Brand CMO persona");
    const analystText = resConsultAnalyst.content[0].text;
    assert.ok(analystText.includes("--- Perspective from Brand CMO persona ---"), 'consult text must label the response with perspective.label');
    console.log('✅ TEST 5 Passed: consult tools include structuredContent.perspective and label output text.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Tool count and cost silence verification
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 6: Tool count and cost silence check ---');
    const toolManifest = JSON.parse(fs.readFileSync('tools-manifest.json', 'utf8'));
    assert.strictEqual(toolManifest.tools.length, 56, 'Tool count must remain unchanged at 56 tools');

    for (const t of toolManifest.tools) {
        const desc = t.description || '';
        assert.ok(!/\b(?:tokens?|via SPT)\b/i.test(desc), `Tool description for ${t.name} must not contain "tokens" or "via SPT"`);
        assert.ok(!/Price:\s*\$/i.test(desc), `Tool description for ${t.name} must not contain legacy "Price: $" format`);
    }
    console.log('✅ TEST 6 Passed: Tool count unchanged (56) and all descriptions satisfy Money & Pricing rules.\n');

    console.log('================================================================');
    console.log(' ALL TESTS PASSED SUCCESSFULLY');
    console.log('================================================================');
}

runVoicesSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
