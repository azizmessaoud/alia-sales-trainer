# Task: Fix LangGraph StateGraph Initialization Crash

## Background & Motivation
The application fails to start or crashes during SSR evaluation of `app/lib/orchestration.server.ts`. The error is `TypeError: Cannot read properties of null (reading 'value')` originating from `@langchain/langgraph/dist/graph/state.js:134:20`. 

This error is a known symptom of using the legacy `channels` configuration object in the `StateGraph` constructor with LangGraph.js v0.2.x or v0.3.x. The library has moved to a more explicit `Annotation` API for state definition.

## Scope & Impact
- **File:** `app/lib/orchestration.server.ts`
- **Impact:** Prevents the AI orchestration layer from loading, breaking the core functionality of the ALIA avatar (Compliance, RAG, LLM, TTS, LipSync).

## Technical Reasoning
In modern LangGraph.js, the `StateGraph` constructor expects a "State Definition" object (an `Annotation`). Passing a plain object with a `channels` key causes the internal logic to fail because it expects to find property descriptors (like `value` and `reducer`) on the state fields, which aren't correctly resolved when passed via the legacy format.

## Implementation Plan

### Phase 1: Research & Verification
- [x] Identify the root cause as an incompatible `StateGraph` initialization pattern.
- [x] Verify the recommended fix: Use `Annotation.Root` to define the graph state.

### Phase 2: Refactoring `app/lib/orchestration.server.ts`
1. **Update Imports**:
   - Add `Annotation` to the imports from `@langchain/langgraph`.
2. **Define State Annotation**:
   - Create a `StateAnnotation` using `Annotation.Root`.
   - Map all existing state fields (`userMessage`, `repId`, `sessionId`, `timestamp`, `isCompliant`, `complianceReason`, `memories`, `repProfile`, `llmResponse`, `audioBase64`, `audioDuration`, `blendshapes`, `stage`, `error`, `metrics`, `onUpdate`).
   - Use `Annotation<T>` for simple fields and `Annotation<T>({ reducer: ..., default: ... })` for complex ones like `metrics`.
3. **Initialize Workflow**:
   - Replace `new StateGraph<OrchestrationState>({ channels: { ... } } as any)` with `new StateGraph(StateAnnotation)`.
4. **Fix Type Compatibility**:
   - Ensure the `initialState` in `orchestrateConversation` and the node return types are compatible with the new `StateAnnotation` type.

### Phase 3: Verification & Validation
- [ ] **Server Evaluation**: Restart `npm run dev` and ensure no `TypeError` occurs during module evaluation.
- [ ] **End-to-End Test**: If possible, trigger a conversation via the UI or a script to verify the graph executes and transitions between nodes correctly.

## Tasks Breakdown
- [ ] Edit `app/lib/orchestration.server.ts` to implement the `Annotation` pattern.
- [ ] Verify the fix by observing the dev server logs.

## Reasoning behind MVP
The goal is to restore system stability. Using the official `Annotation` API is the most direct and supported path to fixing this regression while ensuring future compatibility with LangGraph updates.
