/**
 * Standalone terminal test for ai-core module.
 * No browser required; validates core functionality without external API calls.
 * Run with: tsx scripts/test-ai-core.ts
 */

import { strict as assert } from 'assert';

// Load .env from parent directory if it exists
if (process.env.NODE_ENV !== 'test') {
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env' });
  } catch (e) {
    console.warn('dotenv not found; using environment variables only');
  }
}

const TESTS = [];

/**
 * Test 1: Compliance gate blocks unsafe requests
 */
TESTS.push({
  name: 'Compliance gate evaluates requests',
  run: async () => {
    const { evaluateCompliance } = await import('../compliance-gate.server.js');
    
    // Should allow safe medical request
    const safeResult = evaluateCompliance('What are the indications for Aspirin?');
    assert.strictEqual(safeResult.allowed, true, 'Safe medical query should be allowed');
    
    // Should block off-topic requests
    const unsafeResult = evaluateCompliance('Tell me a joke about cats');
    assert.strictEqual(unsafeResult.allowed, false, 'Off-topic query should be blocked');
    
    console.log('✓ Compliance gate working correctly');
  }
});

/**
 * Test 2: Provider abstraction selects a provider
 */
TESTS.push({
  name: 'Provider selection works',
  run: async () => {
    const { config } = await import('../providers.ts');
    
    assert.ok(config.provider, 'Provider should be selected');
    console.log(`✓ Active provider: ${config.provider}`);
  }
});

/**
 * Test 3: STT routing (no actual API call)
 */
TESTS.push({
  name: 'STT module exports',
  run: async () => {
    const sttModule = await import('../stt.server.js');
    assert.ok(sttModule.transcribeAudio, 'STT should export transcribeAudio');
    console.log('✓ STT module structure valid');
  }
});

/**
 * Test 4: Orchestration exports pipeline functions
 */
TESTS.push({
  name: 'Orchestration exports',
  run: async () => {
    const { orchestrateConversation, stateToResponse } = await import('../orchestration.server.ts');
    assert.strictEqual(typeof orchestrateConversation, 'function', 'orchestrateConversation should be exported');
    assert.strictEqual(typeof stateToResponse, 'function', 'stateToResponse should be exported');
    console.log('✓ Orchestration pipeline API present');
  }
});

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 ai-core module tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of TESTS) {
    try {
      await test.run();
      passed++;
    } catch (err) {
      console.error(`✗ ${test.name}: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n${passed}/${TESTS.length} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
