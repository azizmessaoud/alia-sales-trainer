# ALIA 2.0 Memory OS API Documentation

## Overview
Layer 1: TeleMem-inspired 3-tier memory system for personalized medical sales training.

## API Endpoints

### 1. Health Check
```
GET /api/health
```
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-25T22:30:00Z",
  "version": "2.0.0",
  "services": {
    "supabase": true,
    "openai": true
  },
  "features": {
    "memory_os": true,
    "compliance": true,
    ...
  }
}
```

---

### 2. Store Episode Memory
```
POST /api/memory/store-episode
```

**Request Body:**
```json
{
  "rep_id": "00000000-0000-0000-0000-000000000001",
  "session_id": "uuid-here",
  "transcript": "Doctor: Tell me about CardioMed dosing...\nRep: The standard dose is 10mg once daily...",
  "scores": {
    "accuracy": 85.5,
    "compliance": 92.0,
    "confidence": 78.5,
    "clarity": 88.0
  },
  "feedback": "Good handling of dosage questions. Work on pricing objections."
}
```

**Response:**
```json
{
  "success": true,
  "memory_id": "abc-123-def",
  "message": "Episode memory stored successfully"
}
```

**What it does:**
1. Generates episode narrative from transcript
2. Creates 1536-dim embedding via OpenAI
3. Extracts learning summary using GPT-4 (strengths/struggles)
4. Calculates salience score (memory importance)
5. Stores in `episode_memories` table
6. Updates rep profile trajectory

---

### 3. Retrieve Episode Memories
```
POST /api/memory/retrieve
```

**Request Body:**
```json
{
  "rep_id": "00000000-0000-0000-0000-000000000001",
  "query": "What did this rep struggle with in the past?",
  "threshold": 0.7,
  "limit": 5
}
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "memories": [
    {
      "memory_id": "abc-123",
      "memory_text": "Training Session Summary: Performance: Accuracy 72%, Compliance 85%...",
      "similarity": 0.89,
      "session_date": "2026-02-20",
      "learning_summary": {
        "strengths": ["Quick thinking on dosage"],
        "struggles": ["Pricing objections", "Contraindication detail"],
        "recommended_focus": "Objection handling under pressure"
      }
    }
  ]
}
```

**How semantic search works:**
1. Converts query to embedding
2. Performs cosine similarity search via pgvector
3. Returns memories above threshold (default 0.7)
4. Ordered by relevance (similarity score)

---

### 4. Get Rep Profile
```
GET /api/memory/profile/:rep_id
```

**Example:**
```
GET /api/memory/profile/00000000-0000-0000-0000-000000000001
```

**Response:**
```json
{
  "success": true,
  "profile": {
    "id": "profile-uuid",
    "rep_id": "00000000-0000-0000-0000-000000000001",
    "personality_type": "analytical",
    "learning_style": "visual",
    "confidence_trajectory": [65, 68, 72, 78, 82],
    "total_sessions": 12,
    "avg_accuracy": 82.5,
    "avg_compliance_score": 91.2,
    "weak_topics": ["pricing", "side_effects"],
    "strong_topics": ["dosage", "efficacy_data"],
    "avatar_adaptation_rules": {
      "speak_pace": "moderate",
      "feedback_style": "encouraging"
    }
  },
  "analysis": {
    "trajectory_trend": "improving",
    "confidence_change": 17.0,
    "recommended_focus": ["pricing", "side_effects"],
    "weak_areas": ["pricing", "side_effects"]
  }
}
```

---

## Testing

### Quick Test (PowerShell)
```powershell
# 1. Health check
curl http://localhost:5173/api/health

# 2. Store memory
curl -X POST http://localhost:5173/api/memory/store-episode `
  -H "Content-Type: application/json" `
  -d '{
    "rep_id": "00000000-0000-0000-0000-000000000001",
    "session_id": "test-session-1",
    "transcript": "Doctor: What are the contraindications? Rep: CardioMed should not be used in patients with severe kidney disease or hyperkalemia.",
    "scores": {
      "accuracy": 88,
      "compliance": 95,
      "confidence": 82,
      "clarity": 90
    }
  }'

# 3. Retrieve memories
curl -X POST http://localhost:5173/api/memory/retrieve `
  -H "Content-Type: application/json" `
  -d '{
    "rep_id": "00000000-0000-0000-0000-000000000001",
    "query": "contraindications"
  }'

# 4. Get profile
curl http://localhost:5173/api/memory/profile/00000000-0000-0000-0000-000000000001
```

---

## Database Setup

Before testing, run the migration:

```bash
# Option 1: Direct SQL (if you have psql)
psql postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres -f supabase/migrations/001_memory_os.sql

# Option 2: Supabase Dashboard
# Go to SQL Editor → New Query → Paste migration → Run
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  API Layer (Remix Routes)                       │
│  ├─ /api/memory/store-episode                   │
│  ├─ /api/memory/retrieve                        │
│  └─ /api/memory/profile/:rep_id                 │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────┐
│  Memory OS Library (app/lib/memory-os.server.ts) │
│  ├─ storeEpisodeMemory()                         │
│  ├─ retrieveEpisodeMemories()                    │
│  ├─ getRepProfile()                              │
│  └─ analyzeRepProgress()                         │
└──────┬─────────────────────┬─────────────────────┘
       │                     │
┌──────▼──────┐     ┌────────▼─────────┐
│  Supabase   │     │  OpenAI          │
│  PostgreSQL │     │  - GPT-4         │
│  + pgvector │     │  - Embeddings    │
└─────────────┘     └──────────────────┘
```

---

## Next Steps

1. ✅ Database schema created
2. ✅ Memory OS library implemented
3. ✅ API routes created
4. 🔄 **TODO: Run migration in Supabase**
5. 🔄 **TODO: Test API endpoints**
6. ⏳ Week 2: Build training session UI
7. ⏳ Week 3: Add compliance interceptor
8. ⏳ Week 4: Multi-agent orchestration

---

## Notes

- **Memory retrieval uses semantic search** - queries like "What did this rep struggle with?" automatically find relevant past sessions
- **Salience scoring** ensures critical moments (compliance issues, extreme performance) are prioritized
- **LLM-powered analysis** extracts structured learnings from raw transcripts
- **Profile auto-updates** after each session to track long-term trajectory
- **Ready for Week 2 multimodal integration** - will add gesture, emotion, voice stress to episode memories
