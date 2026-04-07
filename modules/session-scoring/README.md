# session-scoring

## Purpose
Session performance analysis and scoring UI: multimodal metrics processing, competency progression logic, and dashboard components.

## Inputs
- CV/voice/engagement metrics from frontend processing and WebSocket telemetry
- Rep/session identifiers for competency APIs

## Outputs
- Competency level recommendations and progression
- Session HUD and competency visualizations

## Required Environment Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Connections
- Used by routes `app/routes/training/session.$id.tsx` and `app/routes/_index.tsx`
- Backend functions are exposed via `app/routes/api/competency-level.ts`
