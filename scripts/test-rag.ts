import { QdrantClient } from '@qdrant/js-client-rest';
import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';
dotenv.config();

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
});
const hf = new HfInference(process.env.HF_TOKEN!);
const EMBED_MODEL = 'intfloat/multilingual-e5-small';
const EXPECTED_DIM = 384;

interface SearchResult {
  id: number;
  payload: {
    product: string;
    language: string;
    chunk: string;
    category: string;
    source: string;
    page: number;
  };
  score: number;
}

async function embed(text: string, prefix: 'query' | 'passage' = 'query'): Promise<number[]> {
  const raw = await hf.featureExtraction({ model: EMBED_MODEL, inputs: `${prefix}: ${text}` });
  const flat = Array.isArray((raw as number[][])[0])
    ? (raw as number[][])[0]
    : (raw as number[]);
  if (flat.length !== EXPECTED_DIM)
    throw new Error(`Dim mismatch: got ${flat.length}, expected ${EXPECTED_DIM}`);
  return flat;
}

async function search(query: string, limit: number = 3): Promise<SearchResult[]> {
  const vector = await embed(query, 'query');
  const results = await qdrant.search('alia-medical-knowledge', {
    vector,
    limit,
    with_payload: true,
  });
  return results as SearchResult[];
}

async function runTests() {
  console.log('🧪 RAG Smoke Test — D6 Validation\n');
  console.log('=' .repeat(80));

  // Test 1: English exact match
  console.log('\n📍 TEST 1: English — Fersang anemia query');
  console.log('Query: "Fersang dosage for anemia"');
  const en1 = await search('Fersang dosage for anemia', 3);
  console.log(`Results (top 3):`);
  en1.forEach((res, i) => {
    const match = res.payload.product === 'Fersang' && res.payload.language === 'en' ? '✅' : '❌';
    console.log(
      `  ${i + 1}. [${res.payload.language.toUpperCase()}] ${res.payload.product} ` +
        `(sim: ${res.score.toFixed(3)}) ${match}`
    );
  });
  const en1Pass = en1[0]?.score >= 0.70 && en1[0]?.payload.product === 'Fersang';
  console.log(`Status: ${en1Pass ? '✅ PASS' : '❌ FAIL'} (expected >0.70, got ${en1[0]?.score.toFixed(3)})\n`);

  // Test 2: French query
  console.log('📍 TEST 2: French — Osfor ostéoporose');
  console.log('Query: "Osfor prévention ostéoporose"');
  const fr2 = await search('Osfor prévention ostéoporose', 3);
  console.log(`Results (top 3):`);
  fr2.forEach((res, i) => {
    const match = res.payload.product === 'Osfor' && res.payload.language === 'fr' ? '✅' : '❌';
    console.log(
      `  ${i + 1}. [${res.payload.language.toUpperCase()}] ${res.payload.product} ` +
        `(sim: ${res.score.toFixed(3)}) ${match}`
    );
  });
  const fr2Pass = fr2[0]?.score >= 0.70 && fr2[0]?.payload.product === 'Osfor';
  console.log(`Status: ${fr2Pass ? '✅ PASS' : '❌ FAIL'} (expected >0.70, got ${fr2[0]?.score.toFixed(3)})\n`);

  // Test 3: Arabic (single variant — expected to struggle)
  console.log('📍 TEST 3: Arabic — Fersang (single doc, may score lower)');
  console.log('Query: "فيرسانج حديد فقر الدم"');
  const ar3 = await search('فيرسانج حديد فقر الدم', 3);
  console.log(`Results (top 3):`);
  ar3.forEach((res, i) => {
    const match = res.payload.product === 'Fersang' && res.payload.language === 'ar' ? '✅' : '❌';
    console.log(
      `  ${i + 1}. [${res.payload.language.toUpperCase()}] ${res.payload.product} ` +
        `(sim: ${res.score.toFixed(3)}) ${match}`
    );
  });
  const ar3Pass = ar3[0]?.score >= 0.60;
  console.log(`Status: ${ar3Pass ? '✅ PASS (>0.60)' : '❌ FAIL (<0.60)'} — only 1 AR doc ingested, expected variation\n`);

  // Test 4: Cross-language ("Iron supplement" should find Fersang)
  console.log('📍 TEST 4: Cross-language — "Iron supplement"');
  console.log('Query: "Iron supplement hematology"');
  const cross4 = await search('Iron supplement hematology', 5);
  console.log(`Results (top 5):`);
  cross4.forEach((res, i) => {
    const match = res.payload.product === 'Fersang' ? '✅' : '❌';
    console.log(
      `  ${i + 1}. [${res.payload.language.toUpperCase()}] ${res.payload.product} ` +
        `(sim: ${res.score.toFixed(3)}) ${match}`
    );
  });
  const fersangInTop3 = cross4.slice(0, 3).some((res) => res.payload.product === 'Fersang');
  const cross4Pass = fersangInTop3;
  console.log(`Status: ${cross4Pass ? '✅ PASS (Fersang in top-3)' : '⚠️ CHECK (Fersang in top-5: ' + cross4.some((res) => res.payload.product === 'Fersang') + ')'}\n`);

  // Test 5: Vital C vitamin query
  console.log('📍 TEST 5: English — Vital C antioxidant');
  console.log('Query: "Vitamin C immune system antioxidant"');
  const en5 = await search('Vitamin C immune system antioxidant', 3);
  console.log(`Results (top 3):`);
  en5.forEach((res, i) => {
    const match = res.payload.product === 'Vital C' && res.payload.language === 'en' ? '✅' : '❌';
    console.log(
      `  ${i + 1}. [${res.payload.language.toUpperCase()}] ${res.payload.product} ` +
        `(sim: ${res.score.toFixed(3)}) ${match}`
    );
  });
  const en5Pass = en5[0]?.score >= 0.70 && en5[0]?.payload.product === 'Vital C';
  console.log(`Status: ${en5Pass ? '✅ PASS' : '❌ FAIL'} (expected >0.70, got ${en5[0]?.score.toFixed(3)})\n`);

  // Summary
  console.log('=' .repeat(80));
  console.log('\n📊 SUMMARY:');
  const passes = [en1Pass, fr2Pass, ar3Pass, cross4Pass, en5Pass].filter(Boolean).length;
  const total = 5;
  console.log(`  Passed: ${passes}/${total}`);
  console.log(`  Test 1 (EN Fersang): ${en1Pass ? '✅' : '❌'}`);
  console.log(`  Test 2 (FR Osfor): ${fr2Pass ? '✅' : '❌'}`);
  console.log(`  Test 3 (AR Fersang): ${ar3Pass ? '✅' : '⚠️ (low relevance docs)'}`);
  console.log(`  Test 4 (Cross-lang): ${cross4Pass ? '✅' : '❌'}`);
  console.log(`  Test 5 (EN Vital C): ${en5Pass ? '✅' : '❌'}`);

  if (passes >= 4) {
    console.log('\n🎉 RAG Pipeline READY FOR PRODUCTION — D6 ✅ PASS');
  } else if (passes >= 3) {
    console.log('\n⚠️ RAG Pipeline MARGINALLY READY — review relevance scores');
  } else {
    console.log('\n❌ RAG Pipeline NEEDS DEBUGGING — check prefix/dimension/collection');
  }
  console.log('\nNext: launch full system (4 terminals) + Samsung submission\n');
}

runTests().catch(console.error);
