/**
 * ALIA 2.0 - Training Session Page (Week 2 - With Multimodal Sensing)
 * Real-time avatar training with body language + voice analysis
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from '@remix-run/react';
import { MultimodalHUD } from '~/components/MultimodalHUD';
import { getMultimodalProcessor, type MultimodalMetrics } from '~/lib/multimodal-processor.client';
import { CompetencyLevelDisplay, LevelBadge, ProgressBar } from '~/components/CompetencyLevelDisplay';

export default function TrainingSession() {
  const { id: sessionId } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const processingLoopRef = useRef<number | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<Partial<MultimodalMetrics> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intervention, setIntervention] = useState<any>(null);
  const [competencyProgress, setCompetencyProgress] = useState({ current: 1, target: 4 });

  // Test rep — replace with real auth/session data when auth is wired up
  const repId = '00000000-0000-0000-0000-000000000002';

  // Fetch competency progression on mount
  useEffect(() => {
    fetch(`/api/competency-level?rep_id=${encodeURIComponent(repId)}&type=progression`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.progress) {
          setCompetencyProgress({
            current: data.progress.currentLevelNumber ?? 1,
            target: 4,
          });
        }
      })
      .catch(() => { /* silently keep default */ });
  }, [repId]);

  // =====================================================
  // Initialize Multimodal System
  // =====================================================

  useEffect(() => {
    const repId = '00000000-0000-0000-0000-000000000002'; // same as component-level repId

    async function initialize() {
      try {
        // 1. Initialize WebSocket connection
        const ws = new WebSocket('ws://localhost:3001');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          ws.send(JSON.stringify({
            type: 'start_session',
            payload: { rep_id: repId, session_id: sessionId },
          }));
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('WebSocket connection failed');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
        };

        // 2. Initialize multimodal processor
        const processor = getMultimodalProcessor();
        await processor.initialize(videoRef.current!);

        setIsInitialized(true);
        setIsProcessing(true);

        // 3. Start processing loop
        startProcessingLoop();
      } catch (err: any) {
        console.error('Initialization error:', err);
        setError(err.message);
      }
    }

    if (videoRef.current && !isInitialized) {
      initialize();
    }

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (processingLoopRef.current) {
        cancelAnimationFrame(processingLoopRef.current);
      }
      getMultimodalProcessor().cleanup();
    };
  }, [sessionId, isInitialized]);

  // =====================================================
  // Processing Loop
  // =====================================================

  function startProcessingLoop() {
    const processor = getMultimodalProcessor();

    const loop = async () => {
      if (!isProcessing || !videoRef.current) {
        return;
      }

      try {
        const metrics = await processor.processFrame(videoRef.current);

        if (metrics) {
          // Update local state for HUD
          setCurrentMetrics(metrics);

          // Send to WebSocket server
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'multimodal_metrics',
              payload: {
                session_id: sessionId,
                metrics,
              },
            }));
          }
        }
      } catch (err) {
        console.error('Processing error:', err);
      }

      processingLoopRef.current = requestAnimationFrame(loop);
    };

    loop();
  }

  // =====================================================
  // WebSocket Message Handler
  // =====================================================

  function handleWebSocketMessage(message: any) {
    switch (message.type) {
      case 'session_started':
        console.log('Session started:', message.payload);
        break;

      case 'avatar_intervention':
        console.log('🚨 Intervention triggered:', message.payload);
        setIntervention(message.payload);

        // Auto-dismiss after 5 seconds
        setTimeout(() => setIntervention(null), 5000);
        break;

      case 'multimodal_metrics_updated':
        // Metrics acknowledged
        break;

      case 'error':
        console.error('Server error:', message.payload);
        setError(message.payload.message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // =====================================================
  // Render
  // =====================================================

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-6 max-w-md">
          <h2 className="text-2xl font-bold text-red-400 mb-2">❌ Error</h2>
          <p className="text-white">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">ALIA Training Session</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => wsRef.current?.close()}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Stop Session
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video and Intervention */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                />
                {intervention && (
                  <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-md text-sm">
                    Intervention: {intervention.type}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Panel */}
          <div className="space-y-6">
            {/* Current Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Metrics</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Posture Score</span>
                  <span className="font-medium">{currentMetrics?.posture_score || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Words Per Minute</span>
                  <span className="font-medium">{currentMetrics?.speaking_pace || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Engagement Score</span>
                  <span className="font-medium">{currentMetrics?.engagement_score || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-900">Stress Level</span>
                  <span className="font-medium">{currentMetrics?.voice_stress_level || '-'}</span>
                </div>
              </div>
            </div>

            {/* Level Display */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Competency Level</h2>
              <CompetencyLevelDisplay repId="00000000-0000-0000-0000-000000000002" />
            </div>

            {/* Progression */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Progression</h2>
              <ProgressBar current={competencyProgress.current} target={competencyProgress.target} label="Level Progress" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
