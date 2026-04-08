# ai-core Module

**Responsibilities:** LLM orchestration, compliance gating, session memory retrieval, STT/embedding provider abstraction.

## What This Module Does

- **Orchestration** (`orchestration.server.ts`): Coordinates a LangGraph pipeline that chains compliance checks → memory retrieval → LLM response → TTS request.
- **Providers** (`providers.ts`): Abstracts NVIDIA NIM, Groq, and OpenRouter; handles fallback selection.
- **Compliance** (`compliance-gate.server.js`): Rule-based pharma compliance engine; blocks unsafe responses.
- **STT** (`stt.server.js`, `stt-azure.server.js`): Speech-to-text transcription with provider fallback.

## Dependencies

- `@langchain/langgraph` — conversational graph framework
- `@supabase/supabase-js` — memory store
- `openai` (SDK) — NVIDIA NIM client
- `microsoft-cognitiveservices-speech-sdk` — Azure STT

## Run Standalone

```bash
# From this module folder:
cd modules/ai-core

# Set up environment (one-time)
cp .env.example .env
# Edit .env and fill in NVIDIA_API_KEY, SUPABASE credentials, etc.

# Run the module's smoke test
npm run test
```

**What the test does:**
1. Verifies compliance gate correctly blocks unsafe requests.
2. Validates provider selection (NVIDIA → Groq fallback).
3. Confirms orchestration pipeline structure and state transitions.
4. Tests STT routing without making real API calls.

All tests are terminal-only; no browser needed.

## Public API

```typescript
// orchestration.server.ts
export async function orchestrateConversation(
  state: OrchestrationState
): Promise<PipelineUpdate>

export function stateToResponse(state: OrchestrationState): ChatResponse

// providers.ts
export async function generateText(messages, options): Promise<string>
export async function generateEmbedding(text): Promise<number[]>
export async function checkHealth(): Promise<ProviderStatus>

// compliance-gate.server.js
export function evaluateCompliance(userMessage): ComplianceResult
export function buildComplianceInterruptionText(reason): string
```

## Who Should Modify This

- **Add a new LLM provider?** → Edit `providers.ts`.
- **Change compliance rules?** → Edit `compliance-gate.server.js`.
- **Adjust pipeline stages?** → Edit `orchestration.server.ts` and add corresponding tests.
- **Fix STT encoding or fallback logic?** → Edit `stt.server.js`.

## Imports Rule

Files in this module import:
- Only from local folder (`./*`)
- Or from shared services (`../../services/*`)

Example:
```typescript
import { evaluateCompliance } from './compliance-gate.server.js';
import { generateText } from '../../services/llm.service.js';
```

Module imports are NOT allowed to reach into `../tts-lipsync`, `../avatar-ui`, or `../rag-memory` directly.

## Integration Points

- **Consumed by:** `app/routes/api.chat.ts` (HTTP), `server-websocket.js` (WS gateway)
- **Forwards to:** `services/tts.service.js` (TTS stage), `services/memory.service.js` (retrieval)
- **Receives from:** `services/compliance.service.js` (already mirrors internal gate)
