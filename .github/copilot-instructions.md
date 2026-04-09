# ALIA — Reverse Engineering, Dead Code Audit & Modular Monorepo Refactor
# Repo: azizmessaoud/alia-sales-trainer | Branch: aziz
# Strategy: Wrappers-first phased migration — NO business logic changes
# Frozen files (DO NOT MODIFY): server-websocket.js, server-ollama.js

---

## PHASE 0 — REPO ARCHAEOLOGY (Reverse Engineering)

Before touching any file, produce a FULL internal map of the codebase.

### 0.1 — Build the Dependency Graph

Scan every file and produce a dependency map in this format:

```
FILE: modules/ai-core/orchestration.server.ts
  IMPORTS FROM: providers.ts, compliance-gate.server.js, ../rag-memory/*, ../../services/*
  IMPORTED BY: server-websocket.js (line 12), app/routes/api.chat.ts (line 4)
  EXPORTS: orchestrateALIA(), buildSystemPrompt(), ALIAResponse (type)
  DEAD EXPORTS (never imported anywhere): [list them]
```

Repeat for every .ts, .js, .tsx file in:
- modules/ai-core/
- modules/tts-lipsync/
- modules/rag-memory/
- modules/session-scoring/
- modules/avatar-ui/
- app/routes/
- app/components/
- app/hooks/
- services/

### 0.2 — Dead Code Detection

For each file, flag:
- `[DEAD_EXPORT]` — exported function/type/const never imported anywhere
- `[DEAD_BLOCK]` — unreachable code (after return, inside never-true if)
- `[DEAD_FILE]` — file never imported by any other file
- `[DUPLICATE]` — logic copy-pasted in more than one file
- `[COMMENTED_OUT]` — large blocks of commented code (>5 lines)

Output: `docs/DEAD_CODE_AUDIT.md`

### 0.3 — Contract Freeze

Extract all public contracts that server-websocket.js and server-ollama.js depend on:
- Every function signature they call from modules/
- Every import path they use
- Every response shape they expect

Save as: `docs/FROZEN_CONTRACTS.md`
These contracts MUST remain identical after all refactoring.

### 0.4 — Duplicate TTS Detection

Diff these files and report duplicates:
- modules/tts-lipsync/tts.server.js
- modules/tts-lipsync/tts-azure.server.js
- modules/tts-lipsync/tts-nvidia.server.ts

---

## PHASE 1 — SERVICES FACADE LAYER

Create a shared `services/` directory at repo root with thin facades only.
These facades wrap existing module code — they add NO new logic, only re-export.

Files to create (already scaffolded):
- services/llm.service.ts
- services/tts.service.ts
- services/memory.service.ts
- services/scoring.service.ts
- services/compliance.service.ts
- services/index.ts

Each facade must be compatible with server-websocket.js and server-ollama.js imports.

---

## PHASE 2 — MODULE SELF-CONTAINMENT AUDIT & FIXES

For each module, verify and fix that it ONLY imports from:
1. Its own directory (./)
2. The shared services layer (../../services/)
3. npm packages (node_modules)

Cross-module violations like:
  `modules/ai-core/orchestration.server.ts → ../tts-lipsync/tts.server.js`

Must be replaced with:
  `modules/ai-core/orchestration.server.ts → ../../services/tts.service.ts`

### Per-Module Checklist:

#### modules/ai-core/
- [ ] Audit all imports — flag cross-module violations
- [ ] Replace cross-module imports with ../../services/ equivalents
- [ ] Remove dead exports found in Phase 0
- [ ] Add module barrel: modules/ai-core/index.ts
- [ ] Add Zod validation for all env vars
- [ ] Verify package.json dependencies

#### modules/tts-lipsync/
- [ ] CONSOLIDATION: Merge duplicate TTS logic
  - Keep tts.server.js as router/orchestrator
  - Make tts-azure.server.js a pure Azure adapter
  - Make tts-nvidia.server.ts a pure NVIDIA adapter
- [ ] Add module barrel: modules/tts-lipsync/index.ts
- [ ] Separate .client.ts (browser-only) from .server.js (Node-only)
- [ ] Add Zod validation: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, TTS_PROVIDER

#### modules/rag-memory/
- [ ] Add: embedding.server.ts (768-dim nomic + 4096-dim nvidia/nv-embed-v2)
- [ ] Add: retrieval.server.ts (hybrid BM25 + cosine, RRF fusion)
- [ ] Add: supabase.server.ts (pgvector operations)
- [ ] Add module barrel: modules/rag-memory/index.ts
- [ ] Add Zod validation: SUPABASE_URL, SUPABASE_ANON_KEY, OLLAMA_BASE_URL

#### modules/session-scoring/
- [ ] Extract scoring logic from server-websocket.js
- [ ] Add: competency-level.server.ts
- [ ] Add: sdg-metrics.server.ts
- [ ] Add module barrel: modules/session-scoring/index.ts

#### modules/avatar-ui/
- [ ] Verify all Three.js/RPM imports are browser-safe
- [ ] Add module barrel: modules/avatar-ui/index.ts
- [ ] Document all morphTargetDictionary keys used

---

## PHASE 3 — MODULES/INDEX.TS CLEANUP

Rewrite modules/index.ts as a DEPRECATION SHIM only.
Do NOT add new exports there — redirect to individual module barrels.

---

## PHASE 4 — WORKSPACE ROOT PACKAGE.JSON

Update root package.json to declare npm workspaces for all 5 modules.
Add scripts: dev:all, test:all, typecheck, lint:imports, build:services.

---

## PHASE 5 — GIT BRANCH STRATEGY

Feature branches to create (one per phase):
- feat/monorepo-services-layer
- feat/module-ai-core-cleanup
- feat/module-tts-lipsync-cleanup
- feat/module-rag-memory-scaffold
- feat/module-session-scoring
- feat/module-avatar-ui-cleanup
- feat/monorepo-workspace-config

Each branch must:
1. Pass `npm run typecheck`
2. Pass `npm run test` in its target module
3. Not modify server-websocket.js or server-ollama.js
4. Not change any signature in docs/FROZEN_CONTRACTS.md
5. Include a MIGRATION.md with before/after import paths

---

## PHASE 6 — IMPORT AUDIT SCRIPT

Script already scaffolded at: scripts/audit-imports.mjs
Run: `node scripts/audit-imports.mjs`
Exits with code 1 if any cross-module violations found.

---

## VERIFICATION CHECKLIST (Before Any PR)

- [ ] `npm run typecheck` — zero TypeScript errors
- [ ] `npm run test --workspaces` — all module smoke tests pass
- [ ] `node scripts/audit-imports.mjs` — zero violations
- [ ] `git diff server-websocket.js` — empty
- [ ] `git diff server-ollama.js` — empty
- [ ] All routes in app/routes/ still resolve
- [ ] docs/DEAD_CODE_AUDIT.md reviewed
- [ ] docs/FROZEN_CONTRACTS.md reviewed

---

## CONSTRAINTS

- TypeScript strict mode — no `any`, no `@ts-ignore` without justification
- All env vars validated with Zod at module init
- No circular imports between modules
- No business logic changes during refactor
- server-websocket.js and server-ollama.js are READ-ONLY
- Each module independently runnable: `cd modules/ai-core && npm test`
- Preserve all existing API route response shapes
