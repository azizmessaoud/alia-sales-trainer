/**
 * Standalone terminal test for avatar-ui module.
 * No browser, no DOM required. Validates component contracts and animator wiring.
 * Run with: tsx scripts/test-avatar-ui.ts
 */

import { strict as assert } from 'assert';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const TESTS: TestCase[] = [];
const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function moduleFilePath(fileName: string): string {
  return resolve(moduleDir, fileName);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Test 1: Avatar component exports
 */
TESTS.push({
  name: 'Avatar component exports required symbols',
  run: async () => {
    const content = await fs.readFile(moduleFilePath('Avatar.tsx'), 'utf-8');
    
    assert.ok(content.includes('export const Avatar ='), 'Avatar.tsx should export Avatar');
    assert.ok(content.includes('export interface AvatarHandle'), 'Avatar should define AvatarHandle interface');
    assert.ok(content.includes('playGesture'), 'AvatarHandle should have playGesture method');
    assert.ok(content.includes('playEmotion'), 'AvatarHandle should have playEmotion method');
    assert.ok(content.includes('playLipSync'), 'AvatarHandle should have playLipSync method');
    
    console.log('✓ Avatar component contract valid');
  }
});

/**
 * Test 2: Lip-sync animator contract
 */
TESTS.push({
  name: 'AvatarWithLipSync exports component',
  run: async () => {
    const content = await fs.readFile(moduleFilePath('AvatarWithLipSync.tsx'), 'utf-8');
    
    assert.ok(content.includes('AvatarWithLipSync'), 'Should define AvatarWithLipSync component');
    assert.ok(content.includes('export default AvatarWithLipSync'), 'Should default-export AvatarWithLipSync');
    
    console.log('✓ AvatarWithLipSync component contract valid');
  }
});

/**
 * Test 3: TalkingHead Avatar wrapper
 */
TESTS.push({
  name: 'TalkingHead wrapper component',
  run: async () => {
    const content = await fs.readFile(moduleFilePath('TalkingHeadAvatar.client.tsx'), 'utf-8');
    
    assert.ok(content.includes('TalkingHeadAvatar'), 'Should define TalkingHeadAvatar component');
    assert.ok(content.includes('@met4citizen/talkinghead'), 'Should use TalkingHead library');
    
    console.log('✓ TalkingHead integration present');
  }
});

/**
 * Test 4: No disallowed cross-module imports
 */
TESTS.push({
  name: 'No restricted server imports in avatar-ui',
  run: async () => {
    const files = [
      'Avatar.tsx',
      'AvatarWithLipSync.tsx',
      'AvatarContainer.tsx',
      'TalkingHeadAvatar.client.tsx'
    ];
    
    for (const file of files) {
      const content = await fs.readFile(moduleFilePath(file), 'utf-8').catch(() => '');
      
      const hasServerWebSocketImport = /server-websocket/.test(content);
      const hasServerOllamaImport = /server-ollama/.test(content);
      
      assert.ok(!hasServerWebSocketImport, `${file} should not import server-websocket.js`);
      assert.ok(!hasServerOllamaImport, `${file} should not import server-ollama.js`);
    }
    
    console.log('✓ No restricted server imports detected');
  }
});

/**
 * Test 5: AvatarContainer lazy-load wrapper
 */
TESTS.push({
  name: 'AvatarContainer lazy-load wrapper',
  run: async () => {
    const content = await fs.readFile(moduleFilePath('AvatarContainer.tsx'), 'utf-8');
    
    assert.ok(content.includes('AvatarContainer'), 'Should export AvatarContainer');
    assert.ok(content.includes('lazy') || content.includes('React.lazy'), 'Should use React.lazy for code splitting');
    
    console.log('✓ Avatar container lazy-loading ready');
  }
});

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 avatar-ui module tests\n');
  
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
