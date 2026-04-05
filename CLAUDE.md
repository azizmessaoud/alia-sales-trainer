# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ALIA is an AI-powered medical sales training platform with a 7-layer agentic AI architecture. It features real-time FDA compliance interception, a 3-tier memory system (TeleMem), multimodal sensing (eye contact, body language, voice analysis), and LangGraph-based multi-agent orchestration.

**Tech Stack**: Remix 3, React, TypeScript, TailwindCSS, Supabase (PostgreSQL + pgvector), OpenAI GPT-4, LangGraph, Three.js (3D avatar with TalkingHead.js), TensorFlow.js, MediaPipe

## Common Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:5173)
npm run dev:all          # Start dev + WebSocket server + NVIDIA NIM server

# Building & Running
npm run build            # Build for production
npm run start            # Start production server (remix-serve)

# Testing
npm test                 # Run unit tests (vitest)
npm run test:integration # Run integration tests
npm run test:e2e         # Run E2E tests (Playwright)

# Code Quality
npm run typecheck        # TypeScript type checking
npm run lint             # Run ESLint
npm run format           # Run Prettier

# Database & Data
npm run migrate           # Push Supabase migrations (npx supabase db push)
npm run seed             # Seed products
npm run ingest-vital-docs # Ingest Vital documents to Qdrant
npm run test-rag         # Test RAG pipeline
```

## Architecture

### 7-Layer Agentic AI System
1. **Memory (TeleMem)**: 3-tier system (episodic → consolidated → long-term profile) with vector search via Qdrant
2. **Multimodal Sensing**: Real-time body language, eye contact, voice pace analysis via MediaPipe/TensorFlow.js
3. **Generative Scenarios**: AI-generated synthetic patient cases with adaptive difficulty
4. **Compliance Interception**: Real-time FDA violation detection with immediate avatar interruption
5. **Orchestration**: 5-agent LangGraph coordination (Evaluation, Compliance, Memory, Scenario, Feedback)
6. **SDG Impact**: UN Sustainable Development Goals tracking (SDG 3, 4, 8, 9, 10, 12)
7. **Monitoring**: Sentry error tracking, health checks

### Key Server Files (app/lib/)
- `orchestration.server.ts` - LangGraph multi-agent orchestration
- `memory-os.server.ts` - TeleMem 3-tier memory implementation
- `compliance-gate.server.js` - Real-time FDA compliance checking
- `rag-pipeline.server.ts` - Qdrant-backed retrieval-augmented generation
- `lip-sync-animator.client.ts` - Client-side avatar lip-sync animation
- `tts.server.js` / `tts-azure.server.js` / `tts-nvidia.server.ts` - Text-to-speech implementations

### Key Components (app/components/)
- `Avatar.tsx` - Main 3D avatar component using TalkingHead.js
- `MultimodalHUD.tsx` - Real-time performance metrics overlay
- `TalkingHeadAvatar.client.tsx` - Lip-synced avatar wrapper

### Routes (app/routes/)
- `_index.tsx` - Main training interface
- `api.chat.ts` - Chat API endpoint
- `training/` - Training session routes
- `api/` - Various API endpoints (health, memory, etc.)

## Development Notes

- Client-side code uses `.client.ts` / `.client.tsx` suffix convention (Remix)
- Server-side code uses `.server.ts` / `.server.ts` suffix convention
- WebSocket server runs separately: `node server-websocket.js`
- NVIDIA NIM server for embeddings: `node server-nvidia-nim.js`
- Environment variables required in `.env` (copy from `.env.example`)