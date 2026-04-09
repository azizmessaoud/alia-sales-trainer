# ALIA Sales Trainer — Architecture Reference

> Auto-generated module map from `aziz` branch scan (April 2026).
> Keep this file updated as modules evolve.

---

## Repository Root Structure

```
alia-sales-trainer/
├── .github/
│   └── copilot-instructions.md   # Copilot refactor prompt (Phase 0–6)
├── app/                           # Remix application (routes, components, hooks)
│   ├── routes/                    # All HTTP + API routes
│   ├── components/                # React UI components (Avatar.tsx, Chat.tsx, etc.)
│   └── hooks/                     # Custom React hooks (useWebSocket, etc.)
├── docs/                          # Architecture, contracts, audit reports
├── modules/                       # Core business logic — modular monorepo
│   ├── ai-core/                   # LLM orchestration, providers, STT, compliance
│   ├── avatar-ui/                 # Three.js / R3F avatar, lip-sync, head tracking
│   ├── rag-memory/                # Embeddings, retrieval, Supabase pgvector
│   ├── session-scoring/           # Competency scoring, SDG metrics
│   └── tts-lipsync/               # Azure/NVIDIA TTS, blendshape animation
├── services/                      # Thin facade layer — re-exports from modules/
│   ├── llm.service.ts
│   ├── tts.service.ts
│   ├── memory.service.ts
│   ├── scoring.service.ts
│   ├── compliance.service.ts
│   └── index.ts                   # Barrel + validateAllServices()
├── scripts/
│   └── audit-imports.mjs          # CI cross-module import boundary checker
├── supabase/                      # Supabase migrations and seed data
├── server-websocket.js            # 🔒 FROZEN — WebSocket server (DO NOT MODIFY)
├── server-ollama.js               # 🔒 FROZEN — Ollama LLM server (DO NOT MODIFY)
└── server-nvidia-nim.js           # NVIDIA NIM provider server
```

---

## Module: `modules/ai-core/`

**Purpose:** LLM provider orchestration, system prompt construction, STT (speech-to-text), and compliance gating.

**Public API (what other modules / routes should import):**
```typescript
// Via services/llm.service.ts
import { generateResponse, streamResponse } from '../../services/llm.service';

// Via services/compliance.service.ts  
import { checkCompliance } from '../../services/compliance.service';
```

**Internal files:**
| File | Role |
|------|------|
| `orchestration.server.ts` | Main ALIA response orchestration loop |
| `providers.ts` | Multi-provider LLM router (Ollama / NVIDIA NIM / OpenRouter) |
| `nvidia-nim.server.ts` | NVIDIA NIM API client |
| `compliance-gate.server.js` | Response compliance filter (medical disclaimers, hallucination guard) |
| `stt.server.js` | Speech-to-text (generic) |
| `stt-azure.server.js` | Azure Cognitive Services STT adapter |

**Env vars required:**
- `OLLAMA_BASE_URL` — Ollama server URL
- `NVIDIA_API_KEY` — NIM API key
- `OPENROUTER_API_KEY` — fallback LLM
- `TTS_PROVIDER` — `azure` | `nvidia` | `mock`

---

## Module: `modules/tts-lipsync/`

**Purpose:** Text-to-speech synthesis (Azure + NVIDIA), blendshape frame generation, and lip-sync animation for Ready Player Me avatars.

**Public API:**
```typescript
// Via services/tts.service.ts
import { synthesizeSpeech, synthesizeSpeechWithVisemes } from '../../services/tts.service';
```

**Internal files:**
| File | Role |
|------|------|
| `tts.server.js` | TTS router — dispatches to Azure or NVIDIA adapter |
| `tts-azure.server.js` | Azure Cognitive Services TTS adapter (viseme events) |
| `tts-nvidia.server.ts` | NVIDIA Riva / Audio2Face TTS adapter |
| `lipsync.server.js` | Blendshape frame generation from viseme events |
| `lip-sync-animator.client.ts` | Browser-side animator (Three.js morph targets, lerp, idle gestures) |

**Client/Server boundary:**
- `.server.js` / `.server.ts` → Node.js only, never imported in browser
- `.client.ts` → Browser only, no Node.js APIs

**Env vars required:**
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `TTS_PROVIDER`

---

## Module: `modules/rag-memory/`

**Purpose:** Retrieval-augmented generation — storing session episodes, retrieving context, generating embeddings, querying Supabase pgvector.

**Public API:**
```typescript
// Via services/memory.service.ts
import { storeEpisode, retrieveContext, getRepProfile } from '../../services/memory.service';
```

**Planned files (scaffold):**
| File | Role |
|------|------|
| `embedding.server.ts` | 768-dim nomic (Ollama) + 4096-dim nvidia/nv-embed-v2 |
| `retrieval.server.ts` | Hybrid BM25 + cosine similarity, RRF fusion |
| `supabase.server.ts` | pgvector insert/query operations |
| `index.ts` | Module barrel |

**Env vars required:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OLLAMA_BASE_URL`

---

## Module: `modules/session-scoring/`

**Purpose:** Competency-level evaluation of sales rep performance per conversation turn. SDG (UN Sustainable Development Goals) alignment tracking for pharma compliance.

**Public API:**
```typescript
// Via services/scoring.service.ts
import { scoreResponse, getCompetencyLevel, updateSDGMetrics } from '../../services/scoring.service';
```

**Planned files (scaffold):**
| File | Role |
|------|------|
| `competency-level.server.ts` | Scoring engine (rubric-based evaluation) |
| `sdg-metrics.server.ts` | SDG goal tracking per session |
| `index.ts` | Module barrel |

---

## Module: `modules/avatar-ui/`

**Purpose:** 3D avatar rendering with React Three Fiber, Ready Player Me GLB loading, lip-sync via ARKit morph targets, head tracking, idle animations, and emotion expression blending.

**Key components:**
| File | Role |
|------|------|
| `Avatar.tsx` | GLB loader + Suspense wrapper + LOD |
| `AvatarWithLipSync.tsx` | R3F scene with useFrame animation loop |
| `lip-sync-animator.client.ts` | LipSyncAnimator class (52-channel ARKit → RPM) |

**Browser-only:** All files in this module must be `.client.ts` or standard `.tsx`. No Node.js imports.

**ARKit morph target coverage (RPM Wolf3D_Head, 67 targets):**
- Visemes: `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`
- Jaw: `jawOpen`, `jawForward`, `jawLeft`, `jawRight`
- Emotion: `mouthSmileLeft`, `mouthSmileRight`, `browDownLeft`, `browDownRight`, `browInnerUp`, `browOuterUpLeft`, `browOuterUpRight`
- Eyes: `eyeBlinkLeft`, `eyeBlinkRight`, `eyeSquintLeft`, `eyeSquintRight`, `eyeWideLeft`, `eyeWideRight`

---

## Services Facade Layer (`services/`)

Thin re-export layer. **No business logic here.** All files are facades that:
1. Wrap the corresponding module's exports
2. Maintain stable import paths for server-websocket.js and server-ollama.js
3. Can be updated to point to a new implementation without touching callers

```
services/
├── llm.service.ts        → re-exports from modules/ai-core/providers
├── tts.service.ts        → re-exports from modules/tts-lipsync/tts.server
├── memory.service.ts     → re-exports from modules/rag-memory/
├── scoring.service.ts    → re-exports from modules/session-scoring/
├── compliance.service.ts → re-exports from modules/ai-core/compliance-gate.server
└── index.ts              → barrel + validateAllServices()
```

---

## Frozen Files (DO NOT MODIFY)

| File | Why frozen |
|------|------------|
| `server-websocket.js` | Live WebSocket pipeline — any change risks breaking real-time avatar speech |
| `server-ollama.js` | Ollama LLM server — import contracts must remain stable |

All refactoring must preserve the function signatures and import paths these files depend on.
See `docs/FROZEN_CONTRACTS.md` for the exact contract list.

---

## Branch Strategy for Team Merge

Target upstream: `mouhameddhia/Esprit-PI-4DS1-2025-2026-ALIA-AI-Avatar/tree/feature/picnn`

```
aziz (main working branch)
├── feat/monorepo-services-layer      Phase 1: services/ facades
├── feat/module-ai-core-cleanup       Phase 2: ai-core
├── feat/module-tts-lipsync-cleanup   Phase 2: tts-lipsync consolidation
├── feat/module-rag-memory-scaffold   Phase 2: rag-memory structure
├── feat/module-session-scoring       Phase 2: session-scoring
├── feat/module-avatar-ui-cleanup     Phase 2: avatar-ui + lip-sync bridge
└── feat/monorepo-workspace-config    Phase 4: npm workspaces
```

Each branch is independently mergeable and does not touch frozen files.
