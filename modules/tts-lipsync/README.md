# tts-lipsync

## Purpose
Text-to-speech routing and lip-sync data generation for avatar playback.

## Inputs
- Text response from `ai-core`
- Language and voice preferences from session metadata

## Outputs
- Audio buffers/base64 payloads
- Word boundaries and viseme/blendshape mappings
- Client-side lip-sync animation helpers

## Required Environment Variables
- `AZURE_TTS_KEY`
- `AZURE_TTS_REGION`
- `AZURE_SPEECH_KEY` (backward compatibility)
- `AZURE_SPEECH_REGION` (backward compatibility)
- `NVIDIA_API_KEY` (for NVIDIA TTS/lipsync paths)

## Connections
- Used by `modules/ai-core/orchestration.server.ts`
- Consumed in frontend by `modules/avatar-ui/Avatar.tsx`
