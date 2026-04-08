# tts-lipsync Module

**Responsibilities:** Unified TTS synthesis with provider fallback, word boundary extraction, and blendshape/viseme timeline preparation for audio-driven animation.

## What This Module Does

- **TTS Pipeline** (`tts.server.js`): Chains Azure Speech Synthesis → NVIDIA FastPitch → mock fallback; returns audio + metadata.
- **Azure TTS** (`tts-azure.server.js`): REST API wrapper for Azure Cognitive Services Speech.
- **NVIDIA TTS** (`tts-nvidia.server.ts`): FastPitch + HiFi-GAN via NVIDIA NIM; voice catalog and mock generator.
- **Lip-Sync** (`lipsync.server.js`): Maps utterance phonemes and word boundaries to blendshapes (visemes); timeline for Audio2Face / Metahuman rigs.

## Dependencies

- `openai` (SDK) — NVIDIA NIM client

## Multilingual Support

The TTS module auto-detects language from input text and selects the appropriate voice:

| Language | Code | Voice |
|----------|------|-------|
| English | en-US | en-US-JennyNeural |
| French | fr-FR | fr-FR-DeniseNeural |
| Arabic | ar-SA | ar-SA-ZariyahNeural |
| Spanish | es-ES | es-ES-ElviraNeural |

**Detection Strategy:**
- **Arabic**: Unicode range detection (`\u0600-\u06FF`)
- **French**: Particle matching (le, la, les, un, une, des, est, sont, avec, pour, dans)
- **Spanish**: Particle matching (el, la, los, las, un, una, es, son, con, para, en, que, del)
- **English**: Default fallback

Explicit language override via session parameter: `session.language = 'ar-SA'` (BCP-47 tag)

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
5. Tests multilingual language detection (Arabic, French, Spanish, English).
6. Validates voice selection for each language.

**Test output:** 6/6 tests passed

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
