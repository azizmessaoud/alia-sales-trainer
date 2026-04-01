---
name: alia-architecture-review
description: "Review and plan the ALIA system architecture. Use for: audit current runtime services, map layers (Client/Gateway/AI/Knowledge/Ops), choose a knowledge store (Supabase pgvector vs Neo4j), decide next refactor step, design ingestion pipeline, review WS/LLM/TTS/LipSync service boundaries, plan service split from monolith, identify latency bottlenecks across pipeline stages. DO NOT USE FOR: debugging a specific bug (use default agent), writing feature code, or infrastructure deployment."
argument-hint: 'Describe what you want reviewed, e.g. "audit current services and suggest next refactor"'
---

# ALIA System Architecture Review

## Purpose

Produce a **clear, layered picture** of the ALIA system, map current process(es) onto it, and
prescribe the **single next refactor step** with the highest ROI.

---

## Step 1 — Inventory Current Runtime

Before drawing any architecture, ask (or infer from the codebase) the exact number of processes
currently running:

| Question                                                                            | Why it matters                       |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| How many server processes run? (e.g. `server-websocket.js`, `server-nvidia-nim.js`) | Determines monolith vs already-split |
| Which LLM provider is active? (NVIDIA NIM / Groq / OpenAI / Ollama)                 | Gateway routing complexity           |
| Which TTS provider is primary? (ElevenLabs / NVIDIA fastpitch)                      | Latency budget                       |
| Is Supabase the only DB? Is pgvector enabled?                                       | Knowledge layer status               |
| What observability exists? (logs, metrics, Sentry)                                  | Ops layer readiness                  |

Check the existing codebase for current state:

- [`server-websocket.js`](../../../server-websocket.js) — WebSocket gateway + pipeline
- [`app/lib/orchestration.server.ts`](../../../app/lib/orchestration.server.ts) — Pipeline stages
- [`app/lib/nvidia-nim.server.ts`](../../../app/lib/nvidia-nim.server.ts) — LLM provider
- [`app/lib/tts.server.ts`](../../../app/lib/tts.server.js) — TTS provider (file missing) 
- [`app/lib/memory-os.server.ts`](../../../app/lib/memory-os.server.ts) — Knowledge/memory layer
- [`.env`](../../../.env) — Active provider keys (present = likely active)

---

## Step 2 — Map onto the 5-Layer Architecture

| Layer             | What goes here                                                  | Target ALIA service                              |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| **Client**        | Web avatar (React/TS), VR/desktop later                         | Remix app on port 5173                           |
| **Gateway / API** | WebSocket endpoint, HTTP API, session mgmt, auth, rate limiting | `alia-gateway` (currently `server-websocket.js`) |
| **AI Services**   | LLM Orchestrator, TTS/Audio, LipSync/Blendshapes, Tools/Agents  | `alia-llm`, `alia-audio`, `alia-lipsync`         |
| **Knowledge**     | RAG store, episodic memory, scenario DB, rep profiles           | Supabase pgvector or Neo4j                       |
| **Operations**    | Per-stage metrics (WS/LLM/TTS/audio/lipsync), job queue, CI/CD  | Sentry + Grafana (optional)                      |

For each current process, decide which layer it belongs to and whether it mixes responsibilities.

---

## Step 3 — Evaluate Service Boundaries

For each identified service boundary, check:

1. **Single responsibility** — does this process do only one thing?
2. **Stable interface** — does it communicate through a defined protocol? (REST, WS, gRPC)
3. **Independent deployability** — can it be updated without restarting everything?
4. **Observable** — does it emit per-stage timing and error logs?

Red flags to flag immediately:

- LLM + TTS + LipSync all running inside the same WebSocket handler → split into `alia-audio`
- Knowledge queries mixed into the gateway → extract to a `alia-llm-orchestrator`
- No per-stage timing logs → add before splitting anything

---

## Step 4 — Knowledge Store Decision

Use this decision tree to pick **one** store for the next 2–3 months:

```
Does the team need GraphRAG (case/guideline relationships, multi-hop reasoning)?
├── YES → Neo4j (invest now; migrate pgvector later for embeddings)
└── NO  → Supabase pgvector (fastest to ship; use existing schema in 001_memory_os.sql)
           ├── Is pgvector extension enabled?  → run: CREATE EXTENSION IF NOT EXISTS vector;
           └── Are episode_memories + rep_profiles tables created? → apply supabase/migrations/
```

**Defer dlt / Ray / multi-store** until the single store is stable and ingestion load justifies it.

### Ingestion checklist (for chosen store)

- [ ] One Python/Node script per source type: PDF, Excel, Markdown
- [ ] Clear schema: `content`, `embedding`, `source`, `category`, `created_at`
- [ ] Idempotent upsert (re-run safe)
- [ ] Tested with `search_episode_memories()` RPC returning relevant chunks

---

## Step 5 — Identify the Single Next Refactor Step

Apply this prioritization in order — stop at the first "not done":

1. **Pipeline latency is unpredictable or unlogged**
   → Add per-stage timing to the WS server before anything else.
   Relevant: `server-websocket.js` pipeline stages, `PipelineMetrics` in `orchestration.server.ts`.

2. **Knowledge layer is missing or unstructured**
   → Apply Supabase migrations + test `search_episode_memories()` end-to-end.
   Relevant: `supabase/migrations/001_memory_os.sql`, `app/lib/memory-os.server.ts`.

3. **Gateway mixes LLM + TTS + LipSync in one file**
   → Extract `callTTS()` + `callLipSync()` into their own modules/services.
   Relevant: `server-websocket.js`, `app/lib/tts.server.ts`, `app/lib/tts-nvidia.server.ts`.

4. **No ingestion pipeline for training materials**
   → Write a single ingestion script for the highest-value source (Matrice, Référentiel, Manuel).

5. **Observability gap**
   → Add structured JSON logs (stage name, duration ms, error type) before adding any new features.

Output: one actionable task with the file(s) to change.

---

## Output Format

Produce a response structured as:

```
## Current State
<list of active processes and which layer they belong to>

## Layer Map
<table showing current vs target mapping>

## Boundary Issues
<numbered list of mixed-responsibility or missing-interface problems>

## Knowledge Store Recommendation
<one store + rationale + 3 migration commands>

## Next Single Refactor Step
<title>
Files: <list>
Change: <what to do in 2 sentences>
Win: <what measurably improves>
```

---

## References

- [Master Roadmap](../../../MASTER_ROADMAP.md)
- [Audio Debug Guide](../../../AUDIO_DEBUG_GUIDE.md)
- [Memory OS Schema](../../../supabase/migrations/001_memory_os.sql)
- [Competency Levels Schema](../../../supabase/migrations/002_competency_levels.sql)
- [Orchestration Layer](../../../app/lib/orchestration.server.ts)
- [Week 2 Progress](../../../WEEK_2_PROGRESS.md)
