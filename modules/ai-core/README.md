# ai-core

## Purpose
Core decision engine for ALIA: orchestration, provider abstraction, NVIDIA model integration, and compliance gating.

## Inputs
- User message and session metadata from Remix route `app/routes/api.chat.ts`
- Optional rep profile and memory context from `rag-memory`
- Environment variables for model providers

## Outputs
- Orchestrated response text
- Compliance decisions and interruption reasons
- Timing metadata for pipeline stages

## Required Environment Variables
- `NVIDIA_API_KEY`
- `OPENROUTER_API_KEY` (if provider routing uses OpenRouter)
- `LLM_PROVIDER`

## Connections
- Reads from `rag-memory` (`memory-os.server.ts`, `rag-pipeline.server.ts`)
- Calls `tts-lipsync` for audio/lipsync stages
- Called by Remix API route and WebSocket pipeline
