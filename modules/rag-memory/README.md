# rag-memory

## Purpose
Memory and retrieval subsystem: episode memory storage, profile retrieval, semantic search, and Python worker bridge.

## Inputs
- Rep/session identifiers
- Conversation transcripts and scoring metrics
- Retrieval queries from orchestration

## Outputs
- Retrieved episodic memories and consolidated context
- Rep profile and progression signals
- RAG prompt augmentation context

## Required Environment Variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `EMOTION_SERVICE_URL` (for Python bridge consumers)

## Connections
- Called by `ai-core`
- Exposed through Remix routes `api.memory.*`
- Includes ingestion/testing scripts under `modules/rag-memory/scripts/`
