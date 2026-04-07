# Task: fix-rag-module
**Branch:** aziz | **Status:** ✅ Implemented by Copilot | **Date:** 2026-04-07

## System map
  localhost:5173  Remix 2 frontend (avatar UI)
  localhost:3001  server-websocket.js — WS orchestration, session, scoring
  localhost:3002  server-ollama.js — RAG endpoints, Ollama embeddings (768-dim)
  localhost:5000  Python CV service — DeepFace + OpenCV emotion detection
                  repo: mouhameddhia/Esprit-PI-4DS1-2025-2026-ALIA-AI-Avatar (feature/picnn)

## Root cause of HTTP 500 on all /api/memory/* endpoints
1. SUPABASE_SERVICE_ROLE_KEY was missing from .env (must be service_role, NOT anon key)
2. No startup validation — server booted silently even with broken config
3. pgvector tables and RPC functions did not exist in Supabase
4. No embedding dimension guard — 768 vs 4096 mismatch would corrupt searches silently

## Secondary issues fixed
- server-ollama.js startup banner printed 3x (duplicate listen handlers)
- WebSocket created duplicate session on React StrictMode double-mount
- Emotion service fetch errors spammed console every 5s (Python CV service not running)

## Files changed
| File | Change |
|------|--------|
| supabase/migrations/20260407_rag_functions.sql | CREATED — 3 pgvector tables + 4 RPC functions |
| server-ollama.js | ENV validation, Supabase probe, full error logging, /api/health/embedding, banner fix |
| modules/rag-memory/rag-pipeline.server.ts | 768-dim assertion after every generateEmbedding() |
| modules/rag-memory/memory-os.server.ts | 768-dim assertion after every generateEmbedding() |
| server-websocket.js | Session dedup guard + configurable emotion poll interval |
| .env.example | Added EMOTION_POLL_INTERVAL_MS |

## ⚠️ Manual step required (Copilot cannot do this)
After merging, paste supabase/migrations/20260407_rag_functions.sql
into Supabase SQL Editor and run it:
https://supabase.com/dashboard/project/_/sql

## Required .env keys
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   ← service_role JWT, NOT anon key
OLLAMA_BASE_URL=http://localhost:11434
EMOTION_POLL_INTERVAL_MS=0             ← set to 30000 when Python CV service is running

## Acceptance criteria
- [ ] GET /api/health → supabase: "ok"
- [ ] GET /api/health/embedding → { ok: true, model: "nomic-embed-text", dimension: 768 }
- [ ] POST /api/memory/store → { success: true, id: "uuid" }
- [ ] POST /api/memory/retrieve → { memories: [], count: 0 } (no 500)
- [ ] Banner prints exactly once on startup
- [ ] WS reconnect logs "re-attaching" not "Session started" twice
- [ ] No emotion fetch spam in dev when CV service is not running

## Implementation progress (2026-04-07)
- [x] Created `supabase/migrations/20260407_rag_functions.sql`
  - Added/normalized core tables for episode, consolidated, and profile memory layers.
  - Added RPCs: `search_episode_memories`, `search_consolidated_memories`, `update_rep_profile_after_session`, `consolidate_weekly_memories`.
  - Standardized vector columns to 768 dimensions with safe reset behavior for incompatible existing vectors.
- [x] Hardened `server-ollama.js`
  - Added strict startup env validation for `SUPABASE_SERVICE_ROLE_KEY` (reject anon/publishable patterns).
  - Added startup Supabase probe + RPC compatibility probe.
  - Added full structured error logging helper.
  - Added embedding dimension assertion and `/api/health/embedding` endpoint.
  - Added startup banner dedup guard.
- [x] Added 768-dim assertions in RAG modules
  - `modules/rag-memory/rag-pipeline.server.ts`
  - `modules/rag-memory/memory-os.server.ts`
- [x] Updated `server-websocket.js`
  - Added duplicate session attach guard (`Session re-attaching`).
  - Made emotion polling truly configurable with disable behavior when `EMOTION_POLL_INTERVAL_MS=0`.
- [x] Updated `.env.example`
  - Added `EMOTION_POLL_INTERVAL_MS=0`.

## Handoff notes
1. Run SQL migration manually in Supabase SQL Editor before endpoint validation.
2. `npm run typecheck` is currently blocked by pre-existing local `tsconfig.json` setting:
   - `ignoreDeprecations: "6.0"` (TS5103 invalid value).
3. JS syntax checks passed for:
   - `server-ollama.js`
   - `server-websocket.js`