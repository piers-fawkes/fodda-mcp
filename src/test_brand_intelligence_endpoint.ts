import axios from 'axios';
import { OFFERING_SCOPED_TOOLS } from './index.js';

async function runVerification() {
    console.log('=== Scoped Endpoints & Discovery Verification ===');

    // 1. Verify OFFERING_SCOPED_TOOLS map
    const brandTools = OFFERING_SCOPED_TOOLS['brand-intelligence'];
    if (!brandTools || brandTools.length !== 13) {
        throw new Error(`Expected 13 tools for brand-intelligence, got ${brandTools?.length}`);
    }
    if (!brandTools.includes('brand_tracker') || !brandTools.includes('search_graph')) {
        throw new Error('Missing primary tools in brand-intelligence scope');
    }
    console.log(`✅ OFFERING_SCOPED_TOOLS['brand-intelligence'] contains ${brandTools.length} tools: ${brandTools.join(', ')}`);

    console.log('\nVerification completed successfully!');
}

runVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
