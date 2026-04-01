# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALIA (AI-powered Live Interactive Avatar) is an enterprise medical sales training platform built with a 7-layer agentic AI architecture:

1. **Memory System (Tiered)** - Episode → Consolidated → Rep Profile
2. **Multimodal Sensing** - Body language, eye contact, voice analysis
3. **Generative Scenarios** - AI-generated patient cases
4. **Compliance Interception** - Real-time FDA regulation checking
5. **Multi-Agent Orchestration** - LangGraph state machine
6. **SDG Impact Tracking** - UN Sustainable Development Goals
7. **Monitoring** - MLOps, Sentry, health checks

## Commands

```bash
# Development
npm run dev                    # Start Remix dev server
npm run server                 # Start NVIDIA NIM server
npm run server:ws              # Start WebSocket server
npm run dev:all                # Run all three (concurrently)

# Build & Production
npm run build                  # Build Remix app
npm run start                  # Run production server

# Testing
npm test                      # Unit tests (vitest)
npm run test:integration       # Integration tests
npm run test:e2e              # Playwright E2E tests

# Database
npm run migrate                # Push Supabase migrations
npm run seed                   # Seed product data

# Code Quality
npm run lint                   # ESLint
npm run format                 # Prettier
npm run typecheck              # TypeScript
```

## Architecture

### Core Pipeline (LangGraph)

The main orchestration flow in `app/lib/orchestration.server.ts`:
```
compliance → memory retrieval → LLM → TTS → LipSync
```

Key files:
- `app/lib/orchestration.server.ts` - LangGraph state machine (5 nodes)
- `app/lib/memory-os.server.ts` - 3-tier memory (Episode/Consolidated/Profile)
- `app/lib/providers.ts` - LLM/embedding abstraction (NVIDIA NIM → Groq → Ollama)
- `app/lib/compliance-gate.server.js` - FDA regulation checker

### API Routes

- `app/routes/api.chat.ts` - Main chat endpoint (orchestration entry point)
- `app/routes/api.health.ts` - System health check
- `app/routes/api.memory.*` - Memory operations

### Frontend Components

- `app/components/Avatar.tsx` - 3D talking avatar
- `app/components/MultimodalHUD.tsx` - Real-time metrics overlay
- `app/routes/training/session.$id.tsx` - Training session UI

### Database (Supabase)

- `supabase/migrations/001_memory_os.sql` - Memory tables (episode_memories, consolidated_memories, rep_profiles)
- `supabase/migrations/002_embedding_1024.sql` - 1024-dim vector support
- Uses pgvector for semantic search

## Environment Variables

Key variables in `.env`:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Database
- `NVIDIA_API_KEY` - Primary LLM/embedding (NVIDIA NIM)
- `GROQ_API_KEY` - Fallback LLM
- `OLLAMA_HOST` - Local LLM fallback
- `LLM_PROVIDER`, `EMBEDDING_PROVIDER` - Provider selection

## Key Patterns

- Provider fallback chain: NVIDIA NIM → Groq → Ollama
- Memory uses 1024-dim embeddings (NVIDIA) for pgvector similarity search
- Orchestration supports progressive streaming via callbacks
- Compliance violations trigger immediate avatar interruption

## Tech Stack

- **Frontend**: Remix, React, TailwindCSS, Three.js
- **Backend**: Remix, Supabase (pgvector), LangGraph
- **AI**: NVIDIA NIM (LLM + Embeddings + TTS + LipSync)
- **Testing**: Vitest, Playwright