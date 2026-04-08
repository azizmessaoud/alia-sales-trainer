# tts-lipsync Module

**Responsibilities:** Unified TTS synthesis with provider fallback, word boundary extraction, and blendshape/viseme timeline preparation for audio-driven animation.

## What This Module Does

- **TTS Pipeline** (`tts.server.js`): Chains Azure Speech Synthesis → NVIDIA FastPitch → mock fallback; returns audio + metadata.
- **Azure TTS** (`tts-azure.server.js`): REST API wrapper for Azure Cognitive Services Speech.
- **NVIDIA TTS** (`tts-nvidia.server.ts`): FastPitch + HiFi-GAN via NVIDIA NIM; voice catalog and mock generator.
- **Lip-Sync** (`lipsync.server.js`): Maps utterance phonemes and word boundaries to blendshapes (visemes); timeline for Audio2Face / Metahuman rigs.

## Dependencies

- `openai` (SDK) — NVIDIA NIM client

## Run Standalone

```bash
# From this module folder:
cd modules/tts-lipsync

# Set up environment (one-time)
cp .env.example .env
# Edit .env and fill in AZURE_TTS_KEY, NVIDIA_API_KEY

# Run the module's smoke test
npm run test
```

**What the test does:**
1. Validates TTS pipeline fallback chain (Azure → NVIDIA → mock).
2. Confirms word boundary extraction and timing correctness.
3. Tests viseme alignment without making real audio requests.
4. Verifies mock TTS output shape for avatar integration.

All tests are terminal-only; no browser needed.

## Public API

```typescript
// tts.server.js
export async function runTTS(text, options): Promise<{
  audioBase64: string,
  duration: number,
  wordBoundaries: Array<{ word: string; start: number; end: number }>,
  isMock: boolean,
  provider: 'azure' | 'nvidia' | 'mock'
}>

// lipsync.server.js
export async function wordBoundariesToVisemes(
  wav: Buffer,
  wordBoundaries: Array<{ word: string; start: number; end: number }>
): Promise<VisemeTimeline>

export async function alignmentToVisemes(
  alignment: PronunciationAlignment
): Promise<VisemeTimeline>
```

## Who Should Modify This

- **Add a new TTS provider?** → Edit `tts.server.js` fallback chain.
- **Adjust viseme mapping?** → Edit `lipsync.server.js` → `alignmentToVisemes`.
- **Change fallback order?** → Edit `tts.server.js` route logic.
- **Tune voice selection?** → Edit `tts-nvidia.server.ts` voice catalog.

## Imports Rule

Files in this module import:
- Only from local folder (`./*`)
- Or from shared services (`../../services/*`)

Example:
```typescript
import { synthesizeAzure } from './tts-azure.server.js';
import { llmService } from '../../services/llm.service.js'; // if needed for voice selection
```

Module imports are NOT allowed to reach into `../ai-core`, `../avatar-ui`, or `../rag-memory` directly.

## Integration Points

- **Consumed by:** `modules/ai-core/orchestration.server.ts` (TTS stage invocation)
- **Received from:** `services/tts.service.js` (façade)
- **Delivers to:** `modules/avatar-ui` via blendshape timeline (indirectly through `lipsync.server.js`)
