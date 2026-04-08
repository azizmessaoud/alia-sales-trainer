/**
 * Standalone terminal test for tts-lipsync module.
 * No browser required; validates TTS and lip-sync workflows without external API calls.
 * Run with: tsx scripts/test-tts-lipsync.ts
 */

import { strict as assert } from 'assert';
import { execSync } from 'child_process';

const TESTS = [];

/**
 * Test 1: TTS pipeline exports
 */
TESTS.push({
  name: 'TTS module exports runTTS',
  run: async () => {
    const { runTTS } = await import('../tts.server.js');
    assert.strictEqual(typeof runTTS, 'function', 'runTTS should be exported');
    console.log('✓ TTS pipeline API present');
  }
});

/**
 * Test 2: TTS result shape validation (mock fallback)
 */
TESTS.push({
  name: 'Mock TTS produces valid output shape',
  run: async () => {
    process.env.AZURE_TTS_KEY = 'test-key-disabled';
    process.env.NVIDIA_API_KEY = 'test-key-disabled';
    
    const { runTTS } = await import('../tts.server.js');
    const result = await runTTS('Hello world', { language: 'en-US' });
    
    assert.ok(result.audioBase64, 'Should return audioBase64');
    assert.ok(typeof result.duration === 'number', 'Should return duration');
    assert.ok(Array.isArray(result.wordBoundaries), 'Should return wordBoundaries array');
    assert.ok(result.isMock === true, 'Should mark as mock when providers unavailable');
    assert.strictEqual(result.provider, 'mock', 'Provider should be "mock"');
    
    console.log('✓ TTS output shape valid for avatar integration');
  }
});

/**
 * Test 3: Word boundary extraction
 */
TESTS.push({
  name: 'Word boundaries extracted correctly',
  run: async () => {
    const { runTTS } = await import('../tts.server.js');
    const result = await runTTS('The quick brown fox', { language: 'en-US' });
    
    assert.ok(result.wordBoundaries.length > 0, 'Should extract word boundaries');
    
    for (const { word, start, end } of result.wordBoundaries) {
      assert.ok(typeof word === 'string', `Word should be string, got ${typeof word}`);
      assert.ok(typeof start === 'number' && start >= 0, 'Start time should be non-negative number');
      assert.ok(typeof end === 'number' && end > start, 'End time should be after start');
    }
    
    console.log(`✓ Word boundary timing valid (${result.wordBoundaries.length} words)`);
  }
});

/**
 * Test 4: Lip-sync module structure
 */
TESTS.push({
  name: 'Lip-sync module exports',
  run: async () => {
    const lipsyncModule = await import('../lipsync.server.js');
    assert.ok(lipsyncModule.wordBoundariesToVisemes, 'Should export wordBoundariesToVisemes');
    assert.ok(lipsyncModule.alignmentToVisemes, 'Should export alignmentToVisemes');
    console.log('✓ Lip-sync API present');
  }
});

/**
 * Test 5: Azure TTS provider available (if credentials set)
 */
TESTS.push({
  name: 'Azure TTS wrapper exports',
  run: async () => {
    const { synthesizeAzure } = await import('../tts-azure.server.js');
    assert.strictEqual(typeof synthesizeAzure, 'function', 'synthesizeAzure should be exported');
    console.log('✓ Azure TTS provider interface ready');
  }
});

/**
 * Test 6: NVIDIA TTS provider available (if credentials set)
 */
TESTS.push({
  name: 'NVIDIA TTS wrapper exports',
  run: async () => {
    const { synthesizeSpeechNvidia, generateMockTTSAudio } = await import('../tts-nvidia.server.ts');
    assert.strictEqual(typeof synthesizeSpeechNvidia, 'function', 'synthesizeSpeechNvidia should be exported');
    assert.strictEqual(typeof generateMockTTSAudio, 'function', 'generateMockTTSAudio should be exported');
    console.log('✓ NVIDIA TTS provider interface ready');
  }
});

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 tts-lipsync module tests\n');
  
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
