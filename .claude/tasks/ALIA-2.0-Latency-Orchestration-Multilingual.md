# ALIA 2.0 — Comprehensive Latency + Orchestration + Multilingual Implementation Plan

**Status**: Ready for Review & Approval  
**Created**: 2026-04-01  
**Goal**: Reduce latency from ~3.8s → <1.4s, fix client crashes, add competency scoring, close multilingual gaps

---

## Executive Summary

This plan coordinates **4 phases** across **12 files** (~1,100 net lines) to deliver:

1. **Latency** (Phase 1): -2.4s via Groq STT, ElevenLabs `/with-timestamps`, and streaming TTS
2. **Client stability** (Phase 2): Fix undefined blendshapes crashes
3. **Orchestration** (Phase 3): Wire agent evaluation into session metrics, add competency scoring, implement auto-promotion
4. **Multilingual** (Phase 4): Spanish scaffold + Arabic completion

Each phase is independently committable. Phases can run in parallel after dependencies are met.

---

## Phase 1: Latency Optimizations (~350 lines, -2.4s latency)

### 1a. Replace webkitSpeechRecognition with Groq Whisper

**Why**: Browser Speech Recognition has ~1.0s latency, fails silently in Firefox/Safari, no language control. Groq Whisper is 0.3s, multilingual, free tier available.

**Files**:
- **CREATE** `app/routes/api.stt.ts` (50 lines) — Remix action endpoint
- **EDIT** `app/routes/_index.tsx` (del lines 381–414, add 50 lines) — MediaRecorder handler

**Implementation**:
1. New STT endpoint accepts multipart FormData with audio blob
2. Calls `groq.audio.transcriptions.create({ file, model: 'whisper-large-v3', language })`
3. Client captures audio via `MediaRecorder`, sends to `POST /api/stt`
4. Delete old `SpeechRecognition` useEffect and `recognitionRef`
5. Add `mediaRecorderRef`, `audioChunksRef`, `startGroqSTT()`, update `toggleMicrophone()`

**Latency delta**: STT 1.0s → 0.3s (-0.7s perceived)

**Acceptance**: `fetch('/api/stt', { method: 'POST', body: formData })` returns `{ text, elapsed_ms }` within 1s

---

### 1b. Fix ElevenLabs `/with-timestamps` for Real Visemes

**Why**: Current path requires serial NVIDIA Audio2Face-3D (+0.5s). ElevenLabs returns character alignment + audio in one call, eliminates entire A2F roundtrip.

**Files**:
- **EDIT** `app/lib/tts.server.js` (add 150 lines after existing `runTTS` export)

**Implementation**:
1. Add `runTTSWithTimestamps(text, session, options)` function
   - Calls `/v1/text-to-speech/{voiceId}/with-timestamps`
   - Returns `{ audioBase64, duration, alignment, blendshapes, isMock: false }`
2. Add `alignmentToBlendshapes(alignment, durationSec)` converter
   - Maps character timing → 30fps blendshape frames
   - Includes `charToJaw()`, `charToViseme()`, `jawToARKit()` helpers
   - Output shape: `{ timestamp: number, blendshapes: { jawOpen: number, viseme_*: 0.95 } }`
3. On error, fallback to plain `runTTS()` (graceful degradation)

**Latency delta**: Eliminates 0.5s A2F serial call (-0.5s)

**Acceptance**: `runTTSWithTimestamps('hello', {language: 'en'})` returns frames with proper viseme keys within 2s

---

### 1c. Enable ElevenLabs Streaming TTS

**Why**: Full TTS takes 1.5s. Streaming delivers first chunk at 0.3s. Client plays audio progressively while alignment computes.

**Files**:
- **EDIT** `app/lib/tts.server.js` (add 20 lines) — `runTTSStreaming()` function
- **EDIT** `server-websocket.js` (Stage 3 rewrite, ~80 lines) — Parallel `/stream` + `/with-timestamps`
- **EDIT** `app/hooks/useALIAWebSocket.ts` (add 15 lines) — `onTTSChunk` callback
- **EDIT** `app/routes/_index.tsx` (add 50 lines) — Web Audio API chunk scheduling

**Implementation**:
1. Add `runTTSStreaming()` that calls ElevenLabs `/stream` endpoint, returns raw ReadableStream
2. In `server-websocket.js` Stage 3:
   - Fire both `/stream` and `/with-timestamps` immediately via `Promise.allSettled()`
   - Stream audio chunks as they arrive: `send(ws, 'tts_chunk', { chunk: base64, isFirst, isFinal })`
   - `/with-timestamps` resolves later (~1.5s) but non-blocking
3. Client-side WebSocket hook:
   - New `onTTSChunk` callback receives chunks progressively
   - Web Audio API `scheduleChunk()` queues chunks for seamless playback
   - Audio starts playing ~0.3s after LLM response (not 1.5s)

**Latency delta**: First audio chunk -1.2s (perceived user hears "hello" immediately after LLM text)

**Acceptance**: User perceives LLM response in ~1.1s (0.3s STT + 0.8s LLM), hears audio 0.3s later without waiting for full TTS

---

**Phase 1 Verification**:
```bash
npm run typecheck           # No TS errors
npm test -- orchestration.test.ts --run  # Tests pass (mock path unchanged)
curl -X POST -F "audio=@test.webm" http://localhost:5173/api/stt  # Returns { text, elapsed_ms }
```

**Phase 1 Result**: End-to-end latency **~1.4s** (vs. 3.8s). ✅

---

## Phase 2: Client-Side Break Fixes (~55 lines, unblocks Phase 1)

### 2a. Fix useALIAWebSocket Payload Routing

**Problem**: `payload.blendshapes` undefined for ElevenLabs path (sends `{ visemes, vtimes, vdurations }`). Code crashes at `.length` on undefined.

**Files**:
- **EDIT** `app/hooks/useALIAWebSocket.ts` (add 30 lines + type)

**Implementation**:
1. Add new type `TalkingHeadVisemePayload` interface (visemes/vtimes/vdurations shape)
2. Add new callback option `onLipSyncNative?: (payload, lipsyncTime, isMock) => void`
3. Replace `lipsync_blendshapes` case with branching:
   - If `payload.source === 'elevenlabs_alignment'` → call `onLipSyncNative`
   - Else → handle frames/blendshapes with null guard `if (!payload.frames?.length && !payload.blendshapes?.length) return;`

**Acceptance**: Hook routes ElevenLabs viseme data to new callback; NVIDIA/mock frames to existing callback with guard

---

### 2b. Fix _index.tsx Null Guards

**Problem**: Line 117 & 130 call `.length` and `.map()` on undefined blendshapes.

**Files**:
- **EDIT** `app/routes/_index.tsx` (add 10 lines)

**Implementation**:
1. Add guard at top of `onLipSync` handler: `if (!blendshapes?.length) return;`
2. Import `TalkingHeadVisemePayload` from hook
3. Add `onLipSyncNative` callback stub: `(payload, lipsyncTime, isMock) => { console.log(...); }`

**Acceptance**: Client loads without crashes; blendshapes handler skips silently if frames undefined

---

**Phase 2 Verification**:
```bash
npm run dev  # Client loads, no console errors
# WebSocket connects, receives lipsync_blendshapes → no undefined.length crash
```

**Phase 2 Result**: Client crash-free. ✅

---

## Phase 3: Orchestration + Competency Scoring (~400 lines, depends on Phases 1–2)

### 3a. Wire orchestrateAgents() into handleChat()

**Problem**: `orchestrateAgents()` exists in `agent-orchestration.server.ts` but `server-websocket.js` calls simple `runLLM()` directly, skipping compliance, memory, evaluation.

**Files**:
- **EDIT** `server-websocket.js` (Stage 2 LLM rewrite, ~60 lines)

**Implementation**:
1. In `handleChat()`, replace Stage 2 LLM with:
   ```js
   if (orchestrateAgents && session.rep_id) {
     const agentState = await orchestrateAgents({
       sessionId, repId, doctorId, levelCode, language,
       userMessage: message,
       conversationHistory: session.messages,
       cvMetrics: session.cv_metrics,
       turnNumber: session.turn_number
     });
     llmText = agentState.responseText;
     session.metrics.accuracy = agentState.evaluation.overallScore;
     session.metrics.compliance = agentState.compliance.score;
   } else {
     llmText = await runLLM(session.messages);  // fallback
   }
   ```
2. Add session fields: `turn_number`, `level_code`, `doctor_id`, `cv_metrics`
3. Increment `session.turn_number` at start of each chat

**Acceptance**: Session evaluation populated; orchestration routes through compliance → memory → llm → evaluation

---

### 3b. Map 6 Evaluation Dims → 14 Competencies

**Files**:
- **CREATE** `app/lib/competency-evaluator.server.ts` (100 lines)

**Implementation**:
1. Define `CompetencyScores` interface with 14 fields (all French names, 0-1 normalized)
2. Implement `mapEvaluationToCompetencies(evaluation, complianceScore)` function
3. Mapping rules (user-provided):
   - preparation, ouverture, gestionTemps = structureCompliance
   - sondage, ecouteActive = engagementRate
   - synthese = (communicationClarity + engagementRate) / 2
   - argumentation, preuves = communicationClarity
   - gestionObjections = objectionHandling
   - adaptationProfil, resilience = confidenceLevel
   - closing, crm = overallScore / 10
   - conformite = complianceScore / 100

**Acceptance**: Function produces 14 scores (0-1) from 6 input dimensions

---

### 3c. Implement Automatic Level Promotion

**Files**:
- **CREATE** `app/lib/level-promotion.server.ts` (100 lines)
- **CREATE** `supabase/migrations/20260401_simulation_results.sql` (50 lines)
- **EDIT** `server-websocket.js` handleEndSession (20 lines)

**Implementation**:
1. Create `simulation_results` table in Supabase:
   ```sql
   CREATE TABLE simulation_results (
     id UUID PRIMARY KEY,
     rep_id TEXT NOT NULL,
     session_id TEXT NOT NULL UNIQUE,
     overall_score FLOAT,
     competency_scores JSONB,
     level_at_time TEXT DEFAULT 'BEGINNER',
     is_difficult BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX idx_sim_results_rep ON simulation_results(rep_id, created_at);
   ```
2. Implement `evaluatePromotion(repId)` that queries cumulative stats and returns `PromotionResult`
3. Thresholds (user-provided):
   - Débutant → Junior: avgScore ≥7 on ≥5 sims, structure ≥80%, engagement ≥60%, 0 compliance errors
   - Junior → Confirmé: avgScore ≥8 on ≥10 sims, A-C-R-V ≥70%, adaptation ≥60%, CRM ≥80%
   - Confirmé → Expert: avgScore ≥9 on ≥10 difficult sims, difficult visits ≥70%, long cycle ≥60%
4. In `handleEndSession()`:
   - Insert row into simulation_results with competency scores
   - Call `evaluatePromotion(rep_id)`
   - If `promotion.newLevel`, emit WebSocket `level_promoted` event

**Acceptance**: Rep promoted to new level after threshold met; event received by client

---

**Phase 3 Verification**:
```bash
npm run typecheck
# Orchestration routes through agent evaluation
# Competency scores computed and stored
# Level promotion fires on threshold met
```

**Phase 3 Result**: Evaluation pipeline functional, competency scores persisted, auto-promotion working. ✅

---

## Phase 4: Multilingual Gap Closure (~330 lines, can run parallel with Phase 3)

### 4a. Spanish (ES) Scaffold

**Problem**: Zero implementation. `es-ES` sessions fall through to English.

**Files**:
- **EDIT** `app/lib/doctor-persona.server.ts` (add 100 lines for `buildSpanishPersonaPrompt`)
- **EDIT** `app/lib/compliance-gate.server.ts` (add 30 lines for Spanish pharma patterns)
- **EDIT** All persona helper functions (add 50 lines total for `es` keys)
- **EDIT** `app/lib/scenario-generator.server.ts` (add 20 lines for Spanish prompt)
- **SEED** Seed script (add 1 Spanish doctor)

**Implementation**:
1. Create `buildSpanishPersonaPrompt()` mirroring FR/EN structure but Spanish text
2. Update all `getDescription*` helpers to include `es` key alongside `fr` and `en`
3. Add Spanish pharma compliance patterns (e.g., "indicación no aprobada", "uso no permitido")
4. Update scenario generator to route Spanish → Spanish prompt
5. Seed 1 Spanish-speaking doctor in rep_profiles

**Acceptance**: Spanish session (`language: 'es-ES'`) produces Spanish persona, compliance, feedback with zero English fallthrough

---

### 4b. Arabic (AR) Completion

**Problem**: Exists but incomplete. Missing skepticism, SONCAS, prescribing tendency.

**Files**:
- **EDIT** `app/lib/doctor-persona.server.ts` (expand 100 lines for `buildArabicPersonaPrompt` enrichment)
- **EDIT** Persona helper functions (add 50 lines for complete Arabic fields)

**Implementation**:
1. Expand `buildArabicPersonaPrompt` to include all 14 competency fields (currently missing 8)
2. Add full Arabic descriptions to all `getDescription*` helpers that currently only have `{ fr, en }`
3. Ensure all helper functions have `ar` keys, no fallthrough to English

**Acceptance**: Arabic session produces full persona with all 14 competency fields completely in Arabic

---

### 4c. Optional: Refactor Binary Pattern → i18n (Polish, lower priority)

**Files**:
- **CREATE** `app/lib/i18n.server.ts` (200 lines for translation data + helpers)
- **EDIT** All persona/compliance/scenario files (replace ternaries with `t()` calls)

**Implementation**:
1. Create `detectLang(bcp47: string): 'fr' | 'en' | 'ar' | 'es'`
2. Create `t(key: string, lang: Lang): string` function with fallback chain
3. Build centralized `translations` map for all strings
4. Replace `isFrench ? FR : EN` ternaries with `t(key, lang)` calls across codebase

**Acceptance**: All strings centralized; no binary `isFrench` pattern remains

---

**Phase 4 Verification**:
```bash
npm run typecheck
# Spanish session: language='es-ES' → Spanish persona, compliance, feedback
# Arabic session: language='ar-SA' → Complete Arabic persona (all 14 fields)
# No fallthrough to English
```

**Phase 4 Result**: Spanish complete, Arabic complete, multilingual gaps closed. ✅

---

## Execution Dependencies & Parallelism

```
Phase 1a (Groq STT)        ◄─── No deps
   ↓
Phase 1b (ElevenLabs /with-timestamps)  ◄─── No deps (independent)
   ↓ (can run in parallel after 1b done)
Phase 1c (Streaming TTS)   ◄─── Depends on 1b
   ↓
Phase 2a + 2b (Client fixes) ◄─── Depends on Phase 1
   ↓
Phase 3a (Orchestration wire) ◄─── Depends on agent-orchestration.server.ts (exists)
   ↓
Phase 3b (Competency map) ◄─── Depends on 3a
   ↓
Phase 3c (Level promotion) ◄─── Depends on 3b
   ╱╲ (can run in parallel with 3c)
Phase 4a (Spanish scaffold)  ◄─── Independent
   ↓
Phase 4b (Arabic completion) ◄─── Depends on 4a structure
   ↓
Phase 4c (i18n refactor)    ◄─── Optional polish post-4b
```

**Recommended execution order**:
1. Phase 1a (Groq STT immediately)
2. Phase 1b + 1c (in parallel after 1b)
3. Phase 2 (after Phase 1)
4. Phase 3a + Phase 4a (in parallel after Phase 2)
5. Phase 3b + 4b (in parallel)
6. Phase 3c
7. Phase 4c (optional)

---

## Success Criteria

✅ **Latency**: <1.4s end-to-end (user perceives LLM response in ~1.1s, hears first audio at +0.3s)  
✅ **No crashes**: Client loads without undefined.length errors  
✅ **Orchestration**: Evaluation + compliance recorded, session.metrics populated  
✅ **Competency**: 14 scores computed and persisted per session  
✅ **Level promotion**: Auto-advancement fires on threshold met  
✅ **Multilingual**: Spanish complete, Arabic complete, no English fallthrough  
✅ **Tests**: `npm run typecheck && npm test -- orchestration.test.ts --run` both pass  

---

## Files Modified Summary

| Phase | File | Action | ~Lines |
|-------|------|--------|--------|
| 1a | `app/routes/api.stt.ts` | CREATE | 50 |
| 1a | `app/routes/_index.tsx` | EDIT | del 381–414, +50 |
| 1b | `app/lib/tts.server.js` | EDIT | +150 |
| 1c | `app/lib/tts.server.js` | EDIT | +20 |
| 1c | `server-websocket.js` | EDIT | ~80 (Stage 3) |
| 1c | `app/hooks/useALIAWebSocket.ts` | EDIT | +15 |
| 1c | `app/routes/_index.tsx` | EDIT | +50 |
| 2a | `app/hooks/useALIAWebSocket.ts` | EDIT | +30 |
| 2b | `app/routes/_index.tsx` | EDIT | +10 |
| 3a | `server-websocket.js` | EDIT | ~60 (Stage 2) |
| 3b | `app/lib/competency-evaluator.server.ts` | CREATE | 100 |
| 3c | `app/lib/level-promotion.server.ts` | CREATE | 100 |
| 3c | `supabase/migrations/20260401_*` | CREATE | 50 |
| 3c | `server-websocket.js` | EDIT | ~20 (handleEndSession) |
| 4a | `app/lib/doctor-persona.server.ts` | EDIT | +100 (ES) |
| 4a | `app/lib/compliance-gate.server.ts` | EDIT | +30 (ES) |
| 4a | Persona helpers | EDIT | +50 (ES keys) |
| 4b | `app/lib/doctor-persona.server.ts` | EDIT | +100 (AR expansion) |
| 4b | Persona helpers | EDIT | +50 (complete AR) |
| `.env.example` | EDIT | +5 |

**Total**: ~1,100 net lines | 12 files | 4 phases

---

## Critical Notes

🚫 **DO NOT**:
- Reference `server-nvidia.js` or `server-groq.js` (archived Phase 0, embedding conflicts)
- Run `node server-nvidia.js` on port 3000 (collision with Remix dev)
- Modify `LipSyncAnimator` client code (contract locked)
- Add new npm packages (groq-sdk already in package.json)

✅ **DO**:
- Test each phase before moving to next
- Run `npm run typecheck` after edits
- Commit phase-by-phase for reviewability
- Update `PROJECT_CONTEXT.md` changelog post-phase

---

## Approval Checklist

Before starting Phase 1, confirm:

- [ ] Plan scope is clear and acceptable
- [ ] Phase 1 latency targets (-2.4s) understood
- [ ] Client crash fixes (Phase 2) understood
- [ ] Orchestration wiring (Phase 3) understood
- [ ] Multilingual gaps (Phase 4) understood
- [ ] Execution order (parallelism) acceptable
- [ ] No blocking questions

**Ready to proceed with Phase 1a (Groq STT)?**
