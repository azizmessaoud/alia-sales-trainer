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

const VITAL_DOCS = [
  { id: 1, product: 'Fersang', category: 'hematology', language: 'en',
    chunk: 'Fersang: Iron supplement 50mg, indicated for iron deficiency anemia. Oral administration, once daily with food.',
    source: 'vital_catalog_2025.pdf', page: 12 },
  { id: 2, product: 'Fersang', category: 'hematology', language: 'fr',
    chunk: 'Fersang 30mg — sulfate ferreux. Indiqué dans les anémies ferriprives. Posologie adulte: 1 comprimé par jour.',
    source: 'vital_catalog_2025.pdf', page: 13 },
  { id: 3, product: 'Fersang', category: 'hematology', language: 'ar',
    chunk: 'فيرسانج 30 ملغ — كبريتات الحديدوز. مؤشرات: فقر الدم بنقص الحديد. الجرعة: قرص واحد يومياً.',
    source: 'vital_catalog_2025.pdf', page: 14 },
  { id: 4, product: 'Vital C', category: 'vitamins', language: 'en',
    chunk: 'Vital C 1000mg effervescent tablets. Powerful antioxidant, supports immune system. One tablet daily in water.',
    source: 'vital_catalog_2025.pdf', page: 34 },
  { id: 5, product: 'Vital C', category: 'vitamins', language: 'fr',
    chunk: 'Vital C 1000mg — vitamine C effervescente. Antioxydant puissant, renforce l\'immunité. Un comprimé par jour.',
    source: 'vital_catalog_2025.pdf', page: 35 },
  { id: 6, product: 'Osfor', category: 'bone_health', language: 'en',
    chunk: 'Osfor: Calcium 500mg + Vitamin D3 400 IU. Promotes bone density, prevents osteoporosis. Twice daily with meals.',
    source: 'vital_catalog_2025.pdf', page: 58 },
  { id: 7, product: 'Osfor', category: 'bone_health', language: 'fr',
    chunk: 'Osfor D3 — calcium 500mg + vitamine D3. Prévention de l\'ostéoporose. Deux comprimés par jour pendant les repas.',
    source: 'vital_catalog_2025.pdf', page: 59 },
];

async function embed(text: string): Promise<number[]> {
  // passage: prefix REQUIRED for documents (not query:)
  const raw = await hf.featureExtraction({ model: EMBED_MODEL, inputs: `passage: ${text}` });
  const flat = Array.isArray((raw as number[][])[0])
    ? (raw as number[][])[0]
    : (raw as number[]);
  if (flat.length !== EXPECTED_DIM)
    throw new Error(`Dim mismatch: got ${flat.length}, expected ${EXPECTED_DIM}`);
  return flat;
}

async function ingestVitalDocs() {
  console.log(`🚀 Ingesting ${VITAL_DOCS.length} Vital product chunks...`);
  for (const doc of VITAL_DOCS) {
    const vector = await embed(doc.chunk);
    await qdrant.upsert('alia-medical-knowledge', {
      wait: true,  // ← ensures each point is indexed before continuing
      points: [{ id: doc.id, vector, payload: { ...doc } }],
    });
    console.log(`✅ [${doc.language}] ${doc.product} (dim: ${vector.length})`);
  }
  console.log('🎉 Ingestion complete. Run test-rag to verify.');
}

ingestVitalDocs().catch(console.error);
