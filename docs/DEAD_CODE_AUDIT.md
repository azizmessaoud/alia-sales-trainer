# DEAD CODE AUDIT — ALIA Sales Trainer

> Generated scaffold — to be populated by Phase 0 reverse engineering.
> Run `node scripts/audit-imports.mjs` for cross-module import violations.

**Repo:** azizmessaoud/alia-sales-trainer  
**Branch:** aziz  
**Date:** April 2026  

---

## Legend

| Tag | Meaning |
|-----|---------|
| `[DEAD_EXPORT]` | Exported but never imported anywhere |
| `[DEAD_BLOCK]` | Unreachable code path |
| `[DEAD_FILE]` | File never imported |
| `[DUPLICATE]` | Logic duplicated in 2+ files |
| `[COMMENTED_OUT]` | >5 lines of commented code |

---

## modules/ai-core/

> TODO: Run Phase 0 scan and populate below.

```
FILE: modules/ai-core/orchestration.server.ts
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]

FILE: modules/ai-core/providers.ts
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]

FILE: modules/ai-core/compliance-gate.server.js
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]

FILE: modules/ai-core/stt.server.js
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]

FILE: modules/ai-core/stt-azure.server.js
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]
```

---

## modules/tts-lipsync/

### Suspected Duplicates (Priority: HIGH)

```
DUPLICATE CANDIDATE: synthesizeSpeech()
  Copy 1: tts.server.js — [line TBD]
  Copy 2: tts-azure.server.js — [line TBD]
  Status: TODO — diff and confirm
  Action: Consolidate into tts.server.js; make tts-azure.server.js a thin adapter

DUPLICATE CANDIDATE: buildSSMLPayload() or similar
  Copy 1: tts.server.js — [line TBD]
  Copy 2: tts-azure.server.js — [line TBD]
  Status: TODO
```

```
FILE: modules/tts-lipsync/tts.server.js
  IMPORTS FROM: [TODO]
  IMPORTED BY: server-websocket.js
  DEAD EXPORTS: [TODO]

FILE: modules/tts-lipsync/tts-azure.server.js
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO — may be dead file if tts.server.js handles all]
  DEAD EXPORTS: [TODO]

FILE: modules/tts-lipsync/tts-nvidia.server.ts
  IMPORTS FROM: [TODO]
  IMPORTED BY: [TODO]
  DEAD EXPORTS: [TODO]

FILE: modules/tts-lipsync/lip-sync-animator.client.ts
  IMPORTS FROM: three
  IMPORTED BY: app/components/ (Avatar, AvatarWithLipSync)
  DEAD EXPORTS: [TODO — check validateMorphTargets, unused config types]
```

---

## modules/rag-memory/

> Status: Possibly empty/minimal scaffold — verify directory contents.

```
[TODO: scan directory and list files]
```

---

## modules/session-scoring/

> Status: Verify if scoring logic lives here or in server-websocket.js.

```
[TODO: scan directory and list files]
```

---

## modules/avatar-ui/

```
[TODO: list components and check for unused exports]
```

---

## app/routes/

```
[TODO: scan all route files for dead API handlers or unused loaders]
```

---

## app/hooks/

```
[TODO: verify each hook is used in at least one component]
```

---

## Recommended Deletions (after confirmation)

> Populate after Phase 0 scan.

| File/Export | Type | Reason | Safe to delete? |
|-------------|------|---------|----------------|
| [TODO] | | | |

---

## Action Items

- [ ] Run `node scripts/audit-imports.mjs` → fix all violations
- [ ] Diff tts.server.js vs tts-azure.server.js → extract duplicates
- [ ] Verify modules/rag-memory/ and modules/session-scoring/ contents
- [ ] Check server-websocket.js for inline business logic to extract
