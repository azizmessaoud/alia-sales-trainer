import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });
config();

import { strict as assert } from 'assert';

type TestCase = { name: string; run: () => Promise<void> };
const TESTS: TestCase[] = [];
function getErrorMessage(e: unknown) { return e instanceof Error ? e.message : String(e); }

TESTS.push({
  name: 'memory-os exports retrieveEpisodeMemories',
  run: async () => {
    const mod = await import('../memory-os.server');
    assert.ok(typeof mod.retrieveEpisodeMemories === 'function', 'retrieveEpisodeMemories should be exported');
    console.log('✓ retrieveEpisodeMemories export present');
  }
});

TESTS.push({
  name: 'rag-pipeline exports runRAGPipeline',
  run: async () => {
    const mod = await import('../rag-pipeline.server');
    assert.ok(typeof mod.executeRAG === 'function' || typeof mod.RAGPipeline === 'object', 'rag-pipeline should export executeRAG or RAGPipeline');
    console.log('✓ rag-pipeline API present');
  }
});

TESTS.push({
  name: 'python-worker exports are accessible',
  run: async () => {
    const mod = await import('../python-worker.server');
    assert.ok(typeof mod === 'object', 'python-worker should be importable');
    console.log('✓ python-worker module accessible');
  }
});

TESTS.push({
  name: 'retrieval returns valid shape on empty query',
  run: async () => {
    const { retrieveEpisodeMemories } = await import('../memory-os.server');
    const result = await retrieveEpisodeMemories({ rep_id: 'test', query: 'test query', limit: 1 });
    assert.ok(Array.isArray(result), 'retrieveEpisodeMemories should return an array');
    console.log(`✓ Retrieval shape valid (${result.length} chunks)`);
  }
});

async function runTests() {
  console.log('🧪 rag-memory module tests\n');
  let passed = 0, failed = 0;
  for (const t of TESTS) {
    try { await t.run(); passed++; }
    catch (e) { console.error(`✗ ${t.name}: ${getErrorMessage(e)}`); failed++; }
  }
  console.log(`\n${passed}/${TESTS.length} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}
runTests().catch(e => { console.error('Fatal:', getErrorMessage(e)); process.exit(1); });
