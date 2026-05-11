import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
    'neo4j+s://337edc3e.databases.neo4j.io',
    neo4j.auth.basic('neo4j', 'y2Fp1PU1QeuiYrwLPHjjOpebpAbvST6Z9hPwUG9CWHU')
);

async function main() {
    const session = driver.session({ database: 'neo4j' });
    
    try {
        // 1. Count all evidence types
        console.log('=== EVIDENCE TYPE DISTRIBUTION ===');
        const typeResult = await session.run(`
            MATCH (a:Article)
            WHERE a.psfk_type IS NOT NULL
            RETURN a.psfk_type AS type, count(a) AS count
            ORDER BY count DESC
        `);
        for (const r of typeResult.records) {
            console.log(`  ${r.get('type')}: ${r.get('count').toNumber()}`);
        }

        // 2. Signal nodes specifically
        console.log('\n=== SIGNAL NODES ===');
        const signalResult = await session.run(`
            MATCH (a:Article)
            WHERE a.psfk_type IN ['Signal', 'signal', 'Case Study', 'case study', 'Startup', 'startup']
            RETURN a.psfk_type AS type, count(a) AS count
            ORDER BY count DESC
        `);
        if (signalResult.records.length === 0) {
            console.log('  ❌ No Signal/Case Study/Startup nodes found');
        }
        for (const r of signalResult.records) {
            console.log(`  ${r.get('type')}: ${r.get('count').toNumber()}`);
        }

        // 3. Sample signal articles for query 1 topic
        console.log('\n=== SIGNALS MATCHING "customer service AI" ===');
        const csResult = await session.run(`
            MATCH (a:Article)
            WHERE a.psfk_type IN ['Signal', 'signal', 'Case Study', 'case study', 'Startup', 'startup']
            AND (toLower(a.title) CONTAINS 'customer' OR toLower(a.title) CONTAINS 'service' OR toLower(a.title) CONTAINS 'ai')
            RETURN a.title AS title, a.psfk_type AS type, a.psfk_graph_slug AS graph
            LIMIT 10
        `);
        if (csResult.records.length === 0) {
            console.log('  No matching signals');
        }
        for (const r of csResult.records) {
            console.log(`  [${r.get('type')}] [${r.get('graph')}] ${r.get('title')}`);
        }

        // 4. Check Metric nodes
        console.log('\n=== METRIC NODES (sample) ===');
        const metricResult = await session.run(`
            MATCH (a:Article)
            WHERE a.psfk_type IN ['Metric', 'metric', 'Statistic', 'statistic']
            RETURN a.title AS title, a.psfk_type AS type, a.psfk_graph_slug AS graph
            LIMIT 5
        `);
        for (const r of metricResult.records) {
            console.log(`  [${r.get('type')}] [${r.get('graph')}] ${r.get('title')}`);
        }

        // 5. Check Interpretation nodes
        console.log('\n=== INTERPRETATION NODES ===');
        const interpResult = await session.run(`
            MATCH (a:Article)
            WHERE a.psfk_type IN ['Interpretation', 'interpretation', 'Opinion', 'opinion', 'Analysis', 'analysis']
            RETURN a.psfk_type AS type, count(a) AS count
            ORDER BY count DESC
        `);
        if (interpResult.records.length === 0) {
            console.log('  ❌ No Interpretation/Opinion/Analysis nodes found');
        }
        for (const r of interpResult.records) {
            console.log(`  ${r.get('type')}: ${r.get('count').toNumber()}`);
        }

        // 6. Check what the statistics endpoint actually searches
        console.log('\n=== STATISTIC NODES (dedicated label) ===');
        const statNodeResult = await session.run(`
            MATCH (n:Statistic)
            RETURN count(n) AS count
        `);
        console.log(`  Statistic label count: ${statNodeResult.records[0].get('count').toNumber()}`);

        // 7. Check for any vector index on articles
        console.log('\n=== VECTOR INDEXES ===');
        const indexResult = await session.run(`
            SHOW INDEXES WHERE type = 'VECTOR'
        `);
        for (const r of indexResult.records) {
            console.log(`  ${r.get('name')} → ${r.get('labelsOrTypes')} [${r.get('properties')}]`);
        }

    } finally {
        await session.close();
        await driver.close();
    }
}

main().catch(console.error);
