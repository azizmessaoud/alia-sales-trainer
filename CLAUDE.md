# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
ALIA — AI-powered medical sales training platform with agentic memory, multimodal sensing, and real-time compliance. Built with Remix, LangGraph, Supabase, and Ollama.

## Commands

```bash
# Development
npm run dev              # Remix frontend (port 5173)
npm run server           # NVIDIA NIM API (port 3000)
npm run server:ws        # WebSocket server (port 3001)
npm run dev:all         # Run all services concurrently

# Testing
npm run test             # Unit tests (vitest)
npm run test:integration # Integration tests
npm run test:e2e        # Playwright e2e

# Linting & formatting
npm run lint
npm run format

# Type checking
npm run typecheck

# Database
npm run migrate         # Push Supabase migrations

# RAG scripts
npm run ingest-vital-docs
npm run test-rag
```

## Architecture

```
localhost:5173  Remix 2 frontend
localhost:3000  server-nvidia-nim.js — NVIDIA NIM API wrapper
localhost:3001  server-websocket.js — WS orchestration, session, scoring
localhost:3002  server-ollama.js — RAG endpoints, Ollama embeddings
localhost:5000  Python emotion-service — DeepFace + OpenCV emotion detection
localhost:11434 Ollama (external)
```

## Modules

| Module | Purpose |
|--------|---------|
| `ai-core` | Decision engine, orchestration, provider abstraction, compliance gating |
| `rag-memory` | Memory storage (Supabase), semantic search (Qdrant/Ollama), RAG pipeline |
| `tts-lipsync` | Text-to-speech, lip-sync animation |
| `session-scoring` | Competency tracking, SDG metrics |
| `avatar-ui` | Avatar components (TalkingHead, lip-sync animator) |

## Environment Variables

Key required variables (see `.env.example`):
- `NVIDIA_API_KEY` — AI provider
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Database
- `OLLAMA_BASE_URL=http://localhost:11434` — Embeddings (768-dim nomic-embed-text)
- `EMOTION_SERVICE_URL=http://localhost:5000` — Emotion detection
- `LLM_PROVIDER` — Model selection (nvidia, openai, groq)

## Key Patterns

- Remix routes in `app/routes/` handle HTTP endpoints
- Server entry points (`server-*.js`) run as separate Node processes
- Modules under `modules/` are imported at runtime via dynamic require
- Lip-sync uses @met4citizen/talkinghead with custom animator
- RAG embeddings MUST be 768-dim (assert after generateEmbedding calls)