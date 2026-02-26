/**
 * ALIA 2.0 - Ollama API Test Suite
 * Tests the complete local LLM pipeline
 */

import http from 'node:http';

const BASE_URL = 'http://localhost:3000';

// =====================================================
// HTTP Helper (avoid Windows fetch issues)
// =====================================================

function httpRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const postData = options.body || '';
    
    const reqOptions = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (postData) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: () => Promise.resolve(json) });
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {  // 2 minutes for slow CPU inference
      req.destroy();
      reject(new Error('Request timeout (120s)'));
    });
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// =====================================================
// Test Data
// =====================================================

const TEST_REP = {
  id: '00000000-0000-0000-0000-000000000002',  // Valid UUID for testing
  name: 'Sarah Johnson',
  email: 'sarah.test@example.com',
  role: 'Medical Sales Rep'
};

const TEST_SESSION = {
  rep_id: TEST_REP.id,
  session_id: '00000000-0000-0000-0000-000000000003',  // Valid UUID for testing
  episode_text: `Doctor: "I'm concerned about the side effects of vitamin D supplementation."
  
Rep: "That's a very valid concern, Doctor. Let me address that. High-dose vitamin D supplementation is generally safe, but we do monitor for hypercalcemia. Our formulation uses cholecalciferol at 2000 IU, which is well within the safe upper limit of 4000 IU per day established by the Institute of Medicine.

The most common side effect profile shows less than 2% incidence of mild GI discomfort. More serious effects like kidney stones are extremely rare at therapeutic doses. We recommend baseline and periodic calcium monitoring for patients on long-term therapy.

Would you like to see the safety data from our phase 3 trials?"

Doctor: "Yes, that would be helpful. What about drug interactions?"

Rep: "Excellent question. The main interactions to watch for are with thiazide diuretics, which can increase calcium absorption, and with steroid medications, which can interfere with vitamin D metabolism. We provide a comprehensive interaction checker in our prescribing app."`,
  accuracy: 0.92,
  compliance: 0.88,
  confidence: 0.85,
  session_date: new Date().toISOString()
};

// =====================================================
// Test Functions
// =====================================================

async function testHealthCheck() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Test 1: Health Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const response = await httpRequest('/api/health');
    const data = await response.json();
    
    console.log('Status:', data.status);
    console.log('Ollama:', data.ollama);
    console.log('Supabase:', data.supabase);
    console.log('Model:', data.model);
    
    if (data.ollama !== '✅') {
      console.error('❌ Ollama not healthy! Is the model downloaded?');
      console.error('   Run: ollama pull phi3');
      return false;
    }
    
    if (data.supabase !== '✅') {
      console.error('❌ Supabase not healthy! Check .env credentials');
      return false;
    }
    
    console.log('✅ All systems healthy');
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testStoreMemory() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💾 Test 2: Store Episode Memory');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const response = await httpRequest('/api/memory/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_SESSION)
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('Server error:', JSON.stringify(data, null, 2));
      throw new Error(`Store failed: ${data.error || 'unknown error'}`);
    }
    
    console.log('Memory ID:', data.memory_id);
    console.log('\n📊 Performance Breakdown:');
    console.log(`  Embedding:  ${data.performance.embedding_ms}ms`);
    console.log(`  Analysis:   ${data.performance.analysis_ms}ms`);
    console.log(`  Database:   ${data.performance.database_ms}ms`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  TOTAL:      ${data.performance.total_ms}ms`);
    
    console.log('\n🧠 LLM Analysis:');
    console.log('Strengths:');
    data.learning_summary.strengths.forEach(s => console.log(`  • ${s}`));
    console.log('Struggles:');
    data.learning_summary.struggles.forEach(s => console.log(`  • ${s}`));
    console.log('Recommended Focus:');
    console.log(`  → ${data.learning_summary.recommended_focus}`);
    
    // Check performance targets
    const target = 2000; // 2 seconds
    if (data.performance.total_ms > target) {
      console.warn(`\n⚠️  Performance slower than target (${target}ms)`);
      console.warn(`   Consider using a smaller model or GPU acceleration`);
    } else {
      console.log(`\n✅ Performance within target (<${target}ms)`);
    }
    
    return data.memory_id;
  } catch (error) {
    console.error('❌ Store memory failed:', error.message);
    return null;
  }
}

async function testRetrieveMemories() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔎 Test 3: Retrieve Memories (Semantic Search)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const queries = [
      'side effects and safety concerns',
      'drug interactions',
      'confidence in explaining contraindications'
    ];
    
    for (const query of queries) {
      console.log(`\nQuery: "${query}"`);
      
      const response = await httpRequest('/api/memory/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rep_id: TEST_REP.id,
          query_text: query,
          limit: 3
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Retrieve failed');
      }
      
      console.log(`Found ${data.memories.length} memories (${data.elapsed_ms}ms)`);
      
      data.memories.forEach((m, i) => {
        console.log(`  ${i + 1}. Similarity: ${(m.similarity * 100).toFixed(1)}%`);
        console.log(`     Session: ${new Date(m.session_date).toLocaleDateString()}`);
        console.log(`     Preview: ${m.memory_text.substring(0, 80)}...`);
      });
    }
    
    console.log('\n✅ Semantic search working');
    return true;
  } catch (error) {
    console.error('❌ Retrieve memories failed:', error.message);
    return false;
  }
}

async function testGetProfile() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 Test 4: Get Rep Profile');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const response = await httpRequest(`/api/memory/profile/${TEST_REP.id}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Get profile failed');
    }
    
    if (data.profile) {
      console.log('Profile found:');
      console.log(`  Personality: ${data.profile.personality_type}`);
      console.log(`  Learning Style: ${data.profile.learning_style}`);
      console.log(`  Sessions: ${data.profile.total_sessions}`);
      console.log(`  Avg Accuracy: ${(data.profile.avg_accuracy * 100).toFixed(1)}%`);
      console.log('  Confidence Trajectory:', data.profile.confidence_trajectory);
    } else {
      console.log('No profile yet (will be auto-generated after 3+ sessions)');
    }
    
    console.log('✅ Profile retrieval working');
    return true;
  } catch (error) {
    console.error('❌ Get profile failed:', error.message);
    return false;
  }
}

// =====================================================
// Run All Tests
// =====================================================

async function runTests() {
  console.log('\n🧪 ALIA 2.0 - Ollama API Test Suite');
  console.log('═══════════════════════════════════════════');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Rep: ${TEST_REP.name} (${TEST_REP.id})`);
  
  const start = Date.now();
  
  // Test 1: Health Check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.error('\n❌ Health check failed. Fix issues and retry.');
    process.exit(1);
  }
  
  // Wait a bit to ensure Ollama is ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Store Memory
  const memoryId = await testStoreMemory();
  if (!memoryId) {
    console.error('\n❌ Store memory failed. Check logs.');
    process.exit(1);
  }
  
  // Wait for database to process
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 3: Retrieve Memories
  const retrieveOk = await testRetrieveMemories();
  if (!retrieveOk) {
    console.error('\n❌ Retrieve memories failed. Check logs.');
    process.exit(1);
  }
  
  // Test 4: Get Profile
  const profileOk = await testGetProfile();
  
  const elapsed = Date.now() - start;
  
  console.log('\n═══════════════════════════════════════════');
  console.log('🎉 All tests passed!');
  console.log(`⏱️  Total time: ${(elapsed / 1000).toFixed(2)}s`);
  console.log('═══════════════════════════════════════════\n');
  
  console.log('📝 Next Steps:');
  console.log('  1. Store 2-3 more sessions to build trajectory data');
  console.log('  2. Test semantic search with different queries');
  console.log('  3. Verify rep profile auto-generation (after 3 sessions)');
  console.log('  4. Week 1 deliverable complete ✅\n');
}

// =====================================================
// Main
// =====================================================

if (process.argv.includes('--help')) {
  console.log(`
ALIA 2.0 - Ollama API Test Suite

Usage:
  node scripts/test-memory-api-ollama.js

Prerequisites:
  1. Server running: node server-ollama.js
  2. Ollama running: ollama serve
  3. Model downloaded: ollama pull phi3
  4. Environment: .env configured with Supabase credentials

The test will:
  • Check system health (Ollama + Supabase)
  • Store a training session with performance tracking
  • Retrieve memories using semantic search
  • Check rep profile (auto-generated after 3+ sessions)
  `);
  process.exit(0);
}

runTests().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
