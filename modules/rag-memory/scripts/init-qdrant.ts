/**
 * Initialize Qdrant collections for ALIA 2.0
 * Creates:
 *  - alia-medical-knowledge: Product/compliance docs (384-dim)
 *  - alia-episode-memories: User episode memories (384-dim)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const EMBEDDING_DIM = 384;
const COLLECTIONS = [
  {
    name: process.env.QDRANT_COLLECTION_PRODUCTS || 'alia-medical-knowledge',
    description: 'Medical product knowledge base with compliance docs',
  },
  {
    name: process.env.QDRANT_COLLECTION_MEMORY || 'alia-episode-memories',
    description: 'User episode memories with learning trajectories',
  },
];

async function initializeCollections() {
  console.log('🚀 Initializing Qdrant collections...\n');

  for (const collection of COLLECTIONS) {
    try {
      // Check if collection exists
      const exists = await client.collectionExists(collection.name);
      
      if (exists.exists) {
        console.log(`⏭️  Collection '${collection.name}' already exists`);
        continue;
      }

      // Create collection
      await client.createCollection(collection.name, {
        vectors: {
          size: EMBEDDING_DIM,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
          snapshot_every_nr_served_requests: 200,
        },
      });
      console.log(`✅ Collection '${collection.name}' created (${EMBEDDING_DIM}-dim, Cosine)`);

      // Create payload indices for filtering
      const indices = ['language', 'category', 'rep_id', 'session_id', 'source'];
      for (const index of indices) {
        try {
          await client.createPayloadIndex(collection.name, {
            field_name: index,
            field_schema: 'keyword',
          });
        } catch (e: any) {
          if (e.message?.includes('already exists')) {
            // Index already exists, skip
            continue;
          }
          console.warn(`⚠️  Could not create index for '${index}': ${e.message}`);
        }
      }
      console.log(`   ✅ Payload indices created (language, category, rep_id, session_id, source)`);
    } catch (error: any) {
      console.error(`❌ Error creating collection '${collection.name}':`, error.message);
      throw error;
    }
  }

  console.log('\n✅ Qdrant collections initialized successfully');
  console.log('\nNext steps:');
  console.log('  1. Verify collections in cloud.qdrant.io dashboard');
  console.log('  2. Run: npm run ingest-vital-docs');
  console.log('  3. Test RAG with: npm run test-rag');
}

// Run initialization
initializeCollections().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
