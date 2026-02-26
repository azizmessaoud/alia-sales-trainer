/**
 * ALIA 2.0 - Memory OS Test Script
 * Tests all 3 API endpoints with real data
 */

const DEMO_REP_ID = '00000000-0000-0000-0000-000000000001';
const BASE_URL = 'http://localhost:5173';

console.log('🧪 ALIA 2.0 Memory OS - API Test Suite\n');

// Test 1: Health Check
async function testHealth() {
  console.log('1️⃣ Testing Health Check...');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    if (data.status === 'healthy') {
      console.log('✅ Health check passed');
      console.log(`   Supabase: ${data.services.supabase ? '✅' : '❌'}`);
      console.log(`   OpenAI: ${data.services.openai ? '✅' : '❌'}`);
      console.log(`   Memory OS enabled: ${data.features.memory_os ? '✅' : '❌'}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

// Test 2: Store Episode Memory
async function testStoreMemory() {
  console.log('\n2️⃣ Testing Store Episode Memory...');
  
  const testData = {
    rep_id: DEMO_REP_ID,
    session_id: `test-session-${Date.now()}`,
    transcript: `
Doctor: Tell me about CardioMed and its contraindications.

Rep: CardioMed is indicated for hypertension and chronic heart failure. 
It should not be prescribed to patients with severe kidney disease, hyperkalemia, 
or during pregnancy. The standard dose is 10mg once daily.

Doctor: What about side effects?

Rep: The most common side effects include dizziness, fatigue, and mild hyperkalemia. 
Patients should have their kidney function and potassium levels monitored regularly.

Doctor: How does it compare to competitors in pricing?

Rep: CardioMed is positioned in the mid-range tier. While it may cost slightly more 
than generics, the superior efficacy data and once-daily dosing improve patient compliance.
    `,
    scores: {
      accuracy: 88.5,
      compliance: 95.0,
      confidence: 82.0,
      clarity: 90.0,
    },
    feedback: 'Excellent handling of contraindications and side effects. Strong product knowledge.',
  };

  try {
    const response = await fetch(`${BASE_URL}/api/memory/store-episode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Memory stored successfully');
      console.log(`   Memory ID: ${data.memory_id}`);
      return data.memory_id;
    } else {
      console.error('❌ Failed to store memory:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Store memory request failed:', error.message);
    return null;
  }
}

// Test 3: Retrieve Episode Memories
async function testRetrieveMemories() {
  console.log('\n3️⃣ Testing Retrieve Episode Memories...');
  
  const queries = [
    'What did this rep say about contraindications?',
    'How did the rep handle pricing questions?',
    'Tell me about the side effects discussion',
  ];

  for (const query of queries) {
    console.log(`\n   Query: "${query}"`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/memory/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rep_id: DEMO_REP_ID,
          query,
          threshold: 0.6,
          limit: 3,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log(`   ✅ Found ${data.count} relevant memories`);
        
        data.memories.forEach((memory, idx) => {
          console.log(`\n   Memory ${idx + 1}:`);
          console.log(`   - Similarity: ${(memory.similarity * 100).toFixed(1)}%`);
          console.log(`   - Date: ${memory.session_date}`);
          console.log(`   - Struggles: ${memory.learning_summary.struggles?.join(', ') || 'None'}`);
          console.log(`   - Strengths: ${memory.learning_summary.strengths?.join(', ') || 'None'}`);
        });
      } else {
        console.log(`   ⚠️ No memories found or error: ${data.error || 'Unknown'}`);
      }
    } catch (error) {
      console.error(`   ❌ Retrieve request failed:`, error.message);
    }
  }
}

// Test 4: Get Rep Profile
async function testGetProfile() {
  console.log('\n4️⃣ Testing Get Rep Profile...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/memory/profile/${DEMO_REP_ID}`);
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Profile retrieved successfully');
      console.log(`   Total sessions: ${data.profile.total_sessions}`);
      console.log(`   Avg accuracy: ${data.profile.avg_accuracy?.toFixed(1)}%`);
      console.log(`   Avg compliance: ${data.profile.avg_compliance_score?.toFixed(1)}%`);
      console.log(`   Confidence trajectory: [${data.profile.confidence_trajectory?.map(c => c.toFixed(0)).join(', ')}]`);
      console.log(`\n   Analysis:`);
      console.log(`   - Trend: ${data.analysis.trajectory_trend}`);
      console.log(`   - Confidence change: ${data.analysis.confidence_change > 0 ? '+' : ''}${data.analysis.confidence_change.toFixed(1)}%`);
      console.log(`   - Weak areas: ${data.analysis.weak_areas?.join(', ') || 'None identified'}`);
    } else if (response.status === 404) {
      console.log('⚠️ Profile not found - will be created after first session');
    } else {
      console.error('❌ Failed to get profile:', data.error);
    }
  } catch (error) {
    console.error('❌ Profile request failed:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('═'.repeat(60));
  console.log('Starting Memory OS API tests...\n');
  
  const healthOk = await testHealth();
  
  if (!healthOk) {
    console.log('\n⚠️ Health check failed. Make sure:');
    console.log('   1. Dev server is running (npm run dev)');
    console.log('   2. .env file has Supabase and OpenAI credentials');
    console.log('   3. Database migration has been run');
    return;
  }

  console.log('\n⏳ Waiting 2 seconds before continuing...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  const memoryId = await testStoreMemory();
  
  if (memoryId) {
    console.log('\n⏳ Waiting 3 seconds for embedding generation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await testRetrieveMemories();
  }

  await testGetProfile();

  console.log('\n' + '═'.repeat(60));
  console.log('✅ All tests completed!\n');
  console.log('📚 Next steps:');
  console.log('   1. Check Supabase Dashboard → Table Editor → episode_memories');
  console.log('   2. Try different queries in testRetrieveMemories()');
  console.log('   3. Store multiple sessions to see trajectory analysis');
  console.log('   4. Move to Week 2: Multimodal sensing implementation');
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
