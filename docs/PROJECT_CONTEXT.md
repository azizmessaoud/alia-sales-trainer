# PROJECT_CONTEXT.md - ALIA 2.0 Unified Roadmap & Handoff

> **For any new engineer:** Review the Change Log and latest architecture sections before starting work. Update this file and the log with any significant changes.
  ## Plan & Review

### Before starting work
- Always in plan mode to make a plan
- After get the plan, make sure you Write the plan to .claude/tasks/TASK_NAME.md.
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down.
- If the task require external knowledge or certain package, also research to get latest knowledge (Use Task tool for research)
- Don't over plan it, always think MVP.
- Once you write the plan, firstly ask me to review it. Do not continue until I approve the plan.

### While implementing
- You should update the plan as you work.
- After you complete tasks in the plan, you should update and append detailed descriptions of the changes you made, so following tasks can be easily hand over to other engineers.


## 🎯 Project Overview
**ALIA 2.0 (AI-powered Live Interactive Avatar)** is an enterprise medical sales training platform. It uses a layered agentic AI architecture to provide real-time compliance monitoring, multimodal sensing, adaptive memory, and a live 3D coaching avatar.

### Core Technologies
- **Current Stack:** Remix (React), TypeScript, TailwindCSS, Three.js, Node.js, WebSockets (`ws`), Supabase (PostgreSQL + `pgvector`), LangGraph JS.
- **AI/ML:** NVIDIA NIM (LLM, Embeddings, TTS, Audio2Face), Groq, Ollama, ElevenLabs.
- **Sensing:** MediaPipe / TensorFlow.js (body language, eye contact, face/emotion signals).
- **Target Stack:** Next.js (App Router), Claude (Strategic Planner), Langfuse (Observability), LiteLLM (LLM gateway).

---

## 🏗️ Layered Architecture

### Layer 0 - Clients
- Next.js + React 18 (TS) for web reps/admins (Migration from Remix).
- Future: React Native / Expo mobile shell.

### Layer 1 - Experience & UI
- Next.js `app/` router with shared React components (Avatar, HUD, ChatInput).
- Client-side hooks for WebSockets and multimodal sensing.

### Layer 2 - Real-time Gateway (`server-websocket.js`)
- Dedicated Node WebSocket server on port 3001.
- Manages full-duplex protocol and `AbortController` per session for low-latency interrupts.

### Layer 3 - Orchestration & Agents (`app/lib/orchestration.server.ts`)
- **Conversation Orchestrator:** LangGraph state machine (5 nodes: `compliance` → `memory` → `llm` → `tts` → `lipsync`).
- **Sub-Agents:** Compliance, RAG, Coach, Feedback, and SDG agents.

### Layer 4 - Intelligence Services
- **LLM:** NVIDIA NIM (Primary), Groq/Ollama (Fallbacks), **Claude (Strategic Planner)**.
- **TTS/LipSync:** ElevenLabs (Primary) → NVIDIA FastPitch → NVIDIA Audio2Face-3D → ARKit blendshapes.

### Layer 5 - Memory & RAG
- **TeleMem Memory OS:** Supabase pgvector (1024-dim) for episodic/consolidated memory.
- **RAG Pipeline:** Dual retrieval from Rep Memory and Domain KB (product monographs, clinical guidelines).

### Layer 6 - Data & Observability
- Supabase (Auth, DB, RLS), Sentry, Langfuse (Target), and Grafana.

---

## 🛠️ Key Commands

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

---

## 🧠 RAG & Memory Subsystem

### 1. Knowledge Spaces
- **Global Domain KB:** Product monographs, FDA labels, and clinical guidelines.
- **Rep-centric Memory:** `episode_memories` and `rep_profiles` via TeleMem.
- **Session Scratchpad:** High-resolution context for the active session.

### 2. Retrieval Pipeline
- Semantic query generation (User transcript + Intent).
- Dual retrieval from Rep Memory and Domain KB.
- Optional reranking via Claude or mini-evaluator.
- Guardrails to pre-filter "off-label" or "internal only" chunks.

---

## 🤖 Claude "Planner" Role
Claude is used for **strategic reasoning** outside the real-time loop:
- **Scenario Planner:** Generates multi-session curriculum based on rep gaps.
- **RAG Architect:** Periodic optimization of chunking and metadata strategies.
- **Meta-Evaluator:** Sampling logs to score coaching quality and compliance.
- **Memory Consolidation:** Summarizing episodes into long-term profile signals.

---

## 🚀 Migration Roadmap (Remix → Next.js)

1. **Skeleton:** Initialize Next.js App Router and sync Tailwind/Styles.
2. **Libraries:** Move framework-agnostic `lib/` (Supabase, NIM, RAG) to `@/lib/`.
3. **Components:** Port React components (Avatar, HUD) with path alias updates.
4. **Routes:** Convert Remix loaders/actions to Next.js Route Handlers (`app/api/*/route.ts`).
5. **Gateway:** Keep `server-websocket.js` as a sibling Node service.
6. **Auth:** Transition to Next.js Middleware for Supabase JWT gating.

---

## 🛠️ Development Conventions

### Performance Standards
- **Real-time Latency:** Target <200ms for pipeline start; <800ms for perceived response.
- **Compliance Gate:** MUST run before LLM generation.
- **Logging:** Every major stage MUST emit timing metrics via `logPipelineTiming`.

### Coding Style
- **TypeScript-first** for all logic.
- **Surgical Edits** in latency-sensitive pipeline code.
- **Abort-safe:** Preserve `AbortController` support for uiser interruptions.

### Engineering Rules
- Centralize provider selection via an `LLMRouter`.
- Implement a "No Answer" policy if RAG confidence is low.
- Use explicit and traceable orchestration (LangGraph-ready).

---

## 🧪 Testing
- **Unit:** `npm test` (Vitest).
- **E2E:** `npm run test:e2e` (Playwright).
- **Compliance:** `npm run test:compliance`.
- **Critical Paths:** Interruption handling, streaming order, and RAG retrieval accuracy.

---

## 📜 Change Log

### [2026-03-30] - Unified Documentation & LangGraph Fix Completion
- Created `PROJECT_CONTEXT.md` to unify `CLAUDE.md` and `GEMINI.md`.
- Standardized sections (Architecture, Commands, Conventions, Roadmap).
- Added Change LogA for handoff.
- Fixed `TypeError: Cannot read properties of null (reading 'value')` in `app/lib/orchestration.server.ts` by refactoring `StateGraph` initialization to use the modern `Annotation` API.
- [Next Task]: Verify WebSocket server connectivity on port 3001 and ensure the full pipeline (Compliance → LLM → TTS → LipSync) is functional.
