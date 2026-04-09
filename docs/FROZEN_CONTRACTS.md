# FROZEN CONTRACTS — ALIA Sales Trainer

> These are the exact function signatures and import paths that
> `server-websocket.js` and `server-ollama.js` depend on.
> **Any change to the items in this file is a breaking change.**

**Last verified:** April 2026 (aziz branch)

---

## Rule

During any refactor (Phase 1–6), the following must remain true:
1. All import paths listed here still resolve without modification
2. All function signatures (parameters + return types) remain identical
3. All response object shapes remain identical
4. No new required parameters added to existing functions

---

## server-websocket.js — Imports & Contracts

> TODO: Run Phase 0 scan of server-websocket.js and populate below.

### Imports from modules/

```javascript
// TODO: extract actual import lines from server-websocket.js
// Example format:
// const { synthesizeSpeech } = require('./modules/tts-lipsync/tts.server');
// → CONTRACT: synthesizeSpeech(text: string, voice: string, lang: string) → Promise<TTSResult>

[SCAN PENDING]
```

### Function signatures depended on by server-websocket.js

```typescript
// TODO: document each function call in server-websocket.js with its expected signature

// synthesizeSpeech — tts.server.js
// Parameter 1: [TODO]
// Parameter 2: [TODO]
// Returns: [TODO]

// orchestrateALIA or equivalent — ai-core
// Parameter 1: [TODO]
// Returns: [TODO]
```

### WebSocket message shapes emitted (what the frontend expects)

```typescript
// TODO: document all ws.send() calls in server-websocket.js
// These define the frontend WS protocol — must not change shape

// { type: 'viseme', visemeId: number, audioOffsetTicks: number }
// { type: 'audio_chunk', audioData: string } 
// { type: 'text_chunk', text: string }
// { type: 'emotion', emotion: string }
// [TODO: verify full list from server-websocket.js source]
```

---

## server-ollama.js — Imports & Contracts

> TODO: Run Phase 0 scan of server-ollama.js and populate below.

### Imports from modules/

```javascript
[SCAN PENDING]
```

### Function signatures depended on by server-ollama.js

```typescript
// TODO: document each function call with expected signature
[SCAN PENDING]
```

---

## Verification Command

After any refactoring PR, verify contracts with:
```bash
# Check no frozen file was modified
git diff server-websocket.js  # must be empty
git diff server-ollama.js     # must be empty

# Check import resolution still works
node --input-type=module < server-websocket.js 2>&1 | grep -i 'error\|cannot find'
```

---

## Change Log

| Date | Change | Author | Approved by |
|------|--------|--------|-------------|
| April 2026 | Initial scaffold | azizmessaoud | — |
