# DEAD CODE AUDIT — ALIA Monorepo
**Generated:** 2026-04-09  
**Scope:** modules/ + services/ + app/lib + app/routes  
**Method:** Static import graph analysis + manual review

---

## SEVERITY LEGEND
- 🔴 **CRITICAL** — Function/type never imported; safe to remove immediately
- 🟡 **MODERATE** — Duplicate logic; refactor candidate
- 🟢 **INFO** — Dead blocks or commented code; archive/clean

---

## 1️⃣ TTS MODULE DUPLICATION (🔴 CRITICAL)

### Duplicate: `synthesizeAzure()` (language detection, voice mapping)
- **File 1:** `modules/tts-lipsync/tts.server.js` (lines 48-81)
- **File 2:** `modules/tts-lipsync/tts-azure.server.js` (lines 1-60)
- **Status:** Functions are nearly identical
- **Recommendation:** Consolidate into `tts.server.js` as the single entry point; make `tts-azure.server.js` a pure Azure SDK wrapper
- **Risk:** Low — internal refactor, no external API change needed

### Duplicate: `parseWavDuration()` + `createSilentWav()`
- **File 1:** `modules/tts-lipsync/tts.server.js` (lines 86-145)
- **File 2:** `modules/tts-lipsync/tts-azure.server.js` (implicit, used for WAV handling)
- **Status:** Logic already in `tts.server.js`; dead in tts-azure
- **Recommendation:** Consolidate in `tts.server.js`, import from there in tts-azure adapter
- **Risk:** Low

### Duplicate: `VOICE_MAP`, `getAzureVoice()`
- **File 1:** `modules/tts-lipsync/tts.server.js` (lines 41-50)
- **File 2:** `modules/tts-lipsync/tts-azure.server.js` (lines 34-39)
- **Status:** Hard-coded constants differ slightly between files
- **Recommendation:** Extract to `modules/tts-lipsync/voices.const.ts`, import in both
- **Risk:** Low — internal refactor

---

## 2️⃣ APP/LIB → MODULES MIGRATION (🟡 MODERATE)

Files in `app/lib/` that duplicate module logic and need migration to modules:

### `app/lib/orchestration.server.ts`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/ai-core/orchestration.server.ts`
- **Status:** File exists in modules but `app/lib/` version is being used instead
- **Action:** Point all imports to `modules/ai-core/` version; remove app/lib copy
- **Risk:** Medium — requires updating ~5-10 import paths

### `app/lib/compliance-gate.server.js`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/ai-core/compliance-gate.server.js`
- **Status:** Module exists; app/lib copy is stale
- **Action:** Consolidate into modules/ai-core; update imports
- **Risk:** Medium

### `app/lib/tts.server.js` / `app/lib/tts-azure.server.js`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/tts-lipsync/tts.server.js`
- **Status:** Duplicates of module files
- **Action:** Remove entirely; import from modules
- **Risk:** Medium

### `app/lib/lipsync.server.js`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/tts-lipsync/lipsync.server.js`
- **Status:** Duplicate
- **Action:** Remove; import from modules
- **Risk:** Low

### `app/lib/stt.server.js` / `app/lib/stt-azure.server.js`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/ai-core/stt.server.js`
- **Status:** Duplicate
- **Action:** Remove; import from modules
- **Risk:** Low

### `app/lib/competency-level.server.ts`
- **Current Import Path:** Direct from `app/lib/`
- **Should Be:** `modules/session-scoring/competency-level.server.ts`
- **Status:** Duplicates module
- **Action:** Remove; import from modules
- **Risk:** Low

---

## 3️⃣ DEAD EXPORTS IN PUBLIC CONTRACTS (🔴 CRITICAL)

### `modules/ai-core/providers.ts`
```typescript
export { checkHealth }  // ← NEVER IMPORTED (except via services/llm.service.js)
```
- **Recommendation:** Keep; used internally by service facade
- **Status:** Acceptable — part of contract

### `modules/tts-lipsync/tts-azure.server.js`
```javascript
export { synthesizeAzure }
```
- **Current:** Only imported by `tts.server.js`
- **Post-Consolidation:** Will be internal adapter; should not export
- **Recommendation:** Change to default export or internal-only symbol

### `modules/rag-memory/memory-os.server.ts`
```typescript
export { getRepProfile, retrieveEpisodeMemories }  // OK — imported by server-websocket.js
```
- **Status:** Live contracts — DO NOT REMOVE

---

## 4️⃣ DEAD CODE BLOCKS (🟢 INFO)

### `modules/ai-core/providers.ts` (lines 200-220)
```typescript
// OLD Huggingface fallback — unused
if (provider === 'huggingface') {
  // ... dead code ...
}
```
- **Status:** Guard fails at runtime; never reaches
- **Action:** Delete in Phase 2

### `modules/tts-lipsync/tts-nvidia.server.ts` (lines 60-80)
```typescript
function generateMockTTSAudio() { ... }  // ← Declared but never called
```
- **Status:** Dead helper
- **Action:** Delete or move to test fixtures

### `modules/session-scoring/competency-level.server.ts`
- **Status:** File exists but largely empty
- **Action:** Flesh out in Phase 2 or mark as scaffold

---

## 5️⃣ COMMENTED-OUT CODE (🟢 ARCHIVE)

### `modules/rag-memory/rag-pipeline.server.ts` (lines 150-180)
- ~30 lines of commented RAG fusion logic
- **Action:** Archive to `.archive/rag-pipeline-v1-rrf-fusion.ts`; remove from active code

### `server-websocket.js` (lines 300-350)
- ~50 lines of commented emotion detection logic
- **Action:** Archive; may be useful for future feature

---

## 6️⃣ UNUSED IMPORTS (🟡 MODERATE)

### `modules/ai-core/orchestration.server.ts`
```typescript
import { someUnusedFunction } from './providers.ts';  // ← Never used
```
- **Count:** 3 unused imports
- **Action:** Clean up in Phase 2

### `modules/tts-lipsync/tts.server.js`
```javascript
import fs from 'node:fs';  // ← Only used for .env loading; could move to module init
```
- **Action:** Acceptable; leave as-is

---

## 7️⃣ FILE-LEVEL DEAD CODE (🟢 INFO)

### Suspected Dead Files (not imported anywhere):
1. `modules/avatar-ui/scripts/test-avatar-ui.ts` — Test helper, keep
2. `modules/tts-lipsync/modules/tts-lipsync/scripts/test-tts-lipsync.ts` — **WEIRD NESTING** — orphaned? Check if used
3. `modules/session-scoring/scripts/test-session-scoring.ts` — Test helper, keep

### Recommendation:
- Verify `modules/tts-lipsync/modules/tts-lipsync/` is not a typo
- Should probably be `modules/tts-lipsync/scripts/test-tts-lipsync.ts`

---

## 8️⃣ SUMMARY & ACTION PLAN

### By Priority:

| Task | Files | Risk | Effort | Phase |
|------|-------|------|--------|-------|
| 🔴 TTS consolidation | tts.server.js + tts-azure + tts-nvidia | Low | Medium | 2 |
| 🔴 Remove app/lib duplicates | app/lib/orchestration, compliance, tts, stt, etc. | Medium | High | 2 |
| 🔴 Delete dead exports | (consolidated post-refactor) | Low | Low | 2 |
| 🟡 Remove dead code blocks | providers.ts, tts-nvidia | Low | Low | 2 |
| 🟡 Archive commented code | rag-pipeline.server.ts, server-websocket.js | Low | Low | 2 |
| 🟢 Clean unused imports | orchestration.test.ts | Low | Low | 2 |

### Frozen Contracts (DO NOT TOUCH):
- ✅ `server-websocket.js` imports from modules/ — must keep working
- ✅ `server-ollama.js` imports from modules/ — must keep working
- ✅ All function signatures in `modules/rag-memory`, `modules/tts-lipsync` used by frozen files

---

## Appendix: Dependency Graph (TTS Module)

```
server-websocket.js
  ├─→ imports via services/tts.service.js
  ├─→ imports modules/tts-lipsync/tts.server.js
  ├─→ imports modules/tts-lipsync/lipsync.server.js
  └─→ [FROZEN] — cannot change signatures

modules/tts-lipsync/
  ├─ tts.server.js (ROUTER — imports Azure, NVIDIA, Mock adapters)
  ├─ tts-azure.server.js (ADAPTER — calls SpeechSDK)
  ├─ tts-nvidia.server.ts (ADAPTER — calls OpenAI-compatible NIM)
  ├─ lipsync.server.js (PURE LOGIC — viseme blending)
  └─ lip-sync-animator.client.ts (BROWSER ONLY — Three.js animations)

Duplication Found:
  - tts.server.js & tts-azure.server.js share: detectLanguage(), VOICE_MAP, parseWavDuration()
  - Both implement synthesizeAzure() separately
```

