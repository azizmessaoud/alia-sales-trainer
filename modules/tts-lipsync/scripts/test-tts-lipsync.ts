/**
 * Standalone terminal test for tts-lipsync module.
 * No browser required; validates TTS and lip-sync workflows without external API calls.
 * Run with: tsx scripts/test-tts-lipsync.ts
 */

import { strict as assert } from 'assert';

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const TESTS: TestCase[] = [];

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
    process.env.AZURE_TTS_REGION = '';
    process.env.AZURE_SPEECH_KEY = '';
    process.env.AZURE_SPEECH_REGION = '';
    process.env.NVIDIA_API_KEY = 'test-key-disabled';
    
    const { runTTS } = await import('../tts.server.js');
    const result = await runTTS('Hello world');
    
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
  name: 'Word boundary output shape is valid',
  run: async () => {
    const { runTTS } = await import('../tts.server.js');
    const result = await runTTS('The quick brown fox');
    
    assert.ok(Array.isArray(result.wordBoundaries), 'wordBoundaries should be an array');
    
    for (const { word, start, end } of result.wordBoundaries) {
      assert.ok(typeof word === 'string', `Word should be string, got ${typeof word}`);
      assert.ok(typeof start === 'number' && start >= 0, 'Start time should be non-negative number');
      assert.ok(typeof end === 'number' && end > start, 'End time should be after start');
    }
    
    console.log(`✓ Word boundary output valid (${result.wordBoundaries.length} boundaries)`);
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
    const { synthesizeSpeechNvidia, generateMockTTSAudio } = await import('../tts-nvidia.server');
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
    } catch (err: unknown) {
      console.error(`✗ ${test.name}: ${getErrorMessage(err)}`);
      failed++;
    }
  }
  
  console.log(`\n${passed}/${TESTS.length} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err: unknown) => {
  console.error('Fatal error:', getErrorMessage(err));
  process.exit(1);
});
