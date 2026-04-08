/**
 * Standalone terminal test for avatar-ui module.
 * No browser, no DOM required. Validates component contracts and animator wiring.
 * Run with: tsx scripts/test-avatar-ui.ts
 */

import { strict as assert } from 'assert';

const TESTS = [];

/**
 * Test 1: Avatar component exports
 */
TESTS.push({
  name: 'Avatar component exports required symbols',
  run: async () => {
    // We can't directly import TSX in Node, so we check the module structure exists.
    // In a real project, you'd use tsx to execute this or use a test framework.
    // For now, we validate the contract by checking file structure.
    
    const fs = await import('fs').then(m => m.promises);
    const avatarPath = new URL('./Avatar.tsx', import.meta.url).pathname;
    const content = await fs.readFile(avatarPath, 'utf-8');
    
    assert.ok(content.includes('export function Avatar'), 'Avatar.tsx should export Avatar function');
    assert.ok(content.includes('export interface AvatarHandle'), 'Avatar should define AvatarHandle interface');
    assert.ok(content.includes('playGesture'), 'AvatarHandle should have playGesture method');
    assert.ok(content.includes('setEmotion'), 'AvatarHandle should have setEmotion method');
    assert.ok(content.includes('applyLipSync'), 'AvatarHandle should have applyLipSync method');
    
    console.log('✓ Avatar component contract valid');
  }
});

/**
 * Test 2: Lip-sync animator contract
 */
TESTS.push({
  name: 'Lip-sync animator exports class',
  run: async () => {
    const fs = await import('fs').then(m => m.promises);
    const animatorPath = new URL('./lip-sync-animator.client.ts', import.meta.url).pathname;
    const content = await fs.readFile(animatorPath, 'utf-8');
    
    assert.ok(content.includes('export default class LipSyncAnimator'), 'Should export LipSyncAnimator class');
    assert.ok(content.includes('applyVisemeTimeline'), 'Should have applyVisemeTimeline method');
    assert.ok(content.includes('clearTimeline'), 'Should have clearTimeline method');
    
    console.log('✓ Lip-sync animator contract valid');
  }
});

/**
 * Test 3: TalkingHead Avatar wrapper
 */
TESTS.push({
  name: 'TalkingHead wrapper component',
  run: async () => {
    const fs = await import('fs').then(m => m.promises);
    const wrapperPath = new URL('./TalkingHeadAvatar.client.tsx', import.meta.url).pathname;
    const content = await fs.readFile(wrapperPath, 'utf-8');
    
    assert.ok(content.includes('TalkingHeadAvatar'), 'Should define TalkingHeadAvatar component');
    assert.ok(content.includes('@met4citizen/talkinghead'), 'Should use TalkingHead library');
    
    console.log('✓ TalkingHead integration present');
  }
});

/**
 * Test 4: No disallowed cross-module imports
 */
TESTS.push({
  name: 'Module import boundaries enforced',
  run: async () => {
    const fs = await import('fs').then(m => m.promises);
    
    const files = [
      './Avatar.tsx',
      './AvatarWithLipSync.tsx',
      './lip-sync-animator.client.ts'
    ];
    
    for (const file of files) {
      const path = new URL(file, import.meta.url).pathname;
      const content = await fs.readFile(path, 'utf-8').catch(() => '');
      
      // Check for disallowed imports
      const hasAICoreImport = /from\s+['"]\.\.\/ai-core/.test(content);
      const hasTTSDirectImport = /from\s+['"]\.\.\/tts-lipsync\/(?!.*service)/.test(content);
      
      assert.ok(!hasAICoreImport, `${file} should not import directly from ../ai-core`);
      assert.ok(!hasTTSDirectImport, `${file} should not import directly from ../tts-lipsync`);
    }
    
    console.log('✓ No cross-module boundary violations detected');
  }
});

/**
 * Test 5: AvatarContainer lazy-load wrapper
 */
TESTS.push({
  name: 'AvatarContainer lazy-load wrapper',
  run: async () => {
    const fs = await import('fs').then(m => m.promises);
    const containerPath = new URL('./AvatarContainer.tsx', import.meta.url).pathname;
    const content = await fs.readFile(containerPath, 'utf-8');
    
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
