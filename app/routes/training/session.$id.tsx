/**
 * ALIA 2.0 - Training Session Page (Week 2 - With Multimodal Sensing)
 * Real-time avatar training with body language + voice analysis
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from '@remix-run/react';
import { MultimodalHUD } from '~/components/MultimodalHUD';
import { getMultimodalProcessor, type MultimodalMetrics } from '~/lib/multimodal-processor.client';

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

  // =====================================================
  // Initialize Multimodal System
  // =====================================================

  useEffect(() => {
    const repId = '00000000-0000-0000-0000-000000000002'; // Test rep

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
    <div className="min-h-screen bg-gray-900 text-white relative">
      {/* Video Feed (hidden, used for processing) */}
      <video
        ref={videoRef}
        className="hidden"
        autoPlay
        playsInline
        muted
      />

      {/* Main Training Area */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">ALIA Training Session</h1>
          <p className="text-gray-400">Session ID: {sessionId}</p>
        </div>

        {/* Avatar Area (Placeholder) */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="aspect-video bg-gray-800 rounded-xl border-2 border-gray-700 flex items-center justify-center">
            {!isInitialized ? (
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-xl">Initializing multimodal sensors...</p>
                <p className="text-sm text-gray-400 mt-2">Requesting camera and microphone access</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4">🤖</div>
                <p className="text-2xl font-semibold">ALIA Avatar</p>
                <p className="text-gray-400 mt-2">Ready to train!</p>
                <div className="mt-6 flex gap-4 justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">Camera Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">Microphone Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">Pose Detection Active</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat Interface (Placeholder) */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h3 className="text-xl font-semibold mb-4">Chat with ALIA</h3>
            <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto mb-4">
              <p className="text-gray-400 text-center">No messages yet. Say hello to start training!</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your message..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                disabled={!isInitialized}
              />
              <button
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50"
                disabled={!isInitialized}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Multimodal HUD Overlay */}
      {isInitialized && <MultimodalHUD metrics={currentMetrics} showDetailed={true} />}

      {/* Intervention Modal */}
      {intervention && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className={`max-w-md rounded-xl p-6 shadow-2xl ${
            intervention.severity === 'warning'
              ? 'bg-yellow-500/90 border-2 border-yellow-400'
              : 'bg-blue-500/90 border-2 border-blue-400'
          }`}>
            <div className="text-center">
              <div className="text-4xl mb-4">
                {intervention.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {intervention.type.replace(/_/g, ' ').toUpperCase()}
              </h3>
              <p className="text-xl text-gray-900 font-semibold">
                {intervention.message}
              </p>
              <button
                onClick={() => setIntervention(null)}
                className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
