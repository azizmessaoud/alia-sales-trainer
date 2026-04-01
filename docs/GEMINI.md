# GEMINI.md - ALIA 2.0 Project Context & Roadmap

## 🎯 Project Overview
**ALIA 2.0 (AI-powered Live Interactive Avatar)** is an enterprise medical sales training platform. It uses a layered agentic AI architecture to provide real-time compliance monitoring, multimodal sensing, adaptive memory, and a live 3D coaching avatar.

### Core Technologies
- **Current Stack:** Remix (React), TypeScript, TailwindCSS, Three.js, Node.js, WebSockets (`ws`), Supabase (PostgreSQL + `pgvector`).
- **AI/ML:** NVIDIA NIM (LLM, Embeddings, TTS, Audio2Face), OpenAI / Groq / Ollama fallbacks.
- **Sensing:** MediaPipe / TensorFlow.js (Body language, eye contact, face/emotion signals).
- **Target Stack:** Next.js (App Router), Claude (Strategic Planner), LangGraph (Orchestration), Langfuse (Observability).

---

## 🏗️ Target Architecture (Layered)

### Layer 0 - Clients
- Next.js + React 18 (TS) for web reps/admins.
- Future: React Native / Expo mobile shell.

### Layer 1 - Experience & UI
- Next.js `app/` router with shared React components (Avatar, HUD, ChatInput).
- Client-side hooks for WebSockets and Multimodal sensing.

### Layer 2 - Real-time Gateway (`server-websocket.js`)
- Dedicated Node WebSocket server on port 3001.
- Manages full-duplex protocol and `AbortController` per session for low-latency interrupts.

### Layer 3 - Orchestration & Agents (`app/lib/orchestration.server.ts`)
- **Conversation Orchestrator:** State machine (`init` → `compliance` → `retrieval` → `llm` → `tts` → `lipsync` → `memory`).
- **Sub-Agents:** Compliance, RAG, Coach, Feedback, and SDG agents.

### Layer 4 - Intelligence Services
- **LLM:** NVIDIA NIM (Primary), Groq/Ollama (Fallbacks), **Claude (Strategic Planner)**.
- **TTS/LipSync:** NVIDIA FastPitch + Audio2Face-3D → ARKit blendshapes.

### Layer 5 - Memory & RAG
- **TeleMem Memory OS:** Supabase pgvector for episodic/consolidated memory.
- **RAG Pipeline:** Product/medical knowledge base separate from rep memory.

### Layer 6 - Data & Observability
- Supabase (Auth, DB, RLS), Sentry, Langfuse, and Grafana.

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
- **Abort-safe:** Preserve `AbortController` support for user interruptions.

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
