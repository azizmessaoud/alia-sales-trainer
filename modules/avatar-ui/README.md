# avatar-ui

## Purpose
Avatar presentation module for rendering TalkingHead/3D avatar and applying lip-sync animation.

## Inputs
- Audio and blendshape frames from WebSocket events
- Session state and speaking state from Remix UI

## Outputs
- Rendered avatar with synchronized facial animation
- Avatar component APIs for route-level control

## Required Environment Variables
- No direct server-side secrets required
- Uses frontend runtime config and WS endpoints from app environment

## Connections
- Used by `app/routes/_index.tsx`
- Consumes lip-sync helper from `tts-lipsync`
- Optionally requests NVIDIA lipsync from `ai-core`
