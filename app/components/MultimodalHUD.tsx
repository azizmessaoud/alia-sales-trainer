/**
 * ALIA 2.0 - Multimodal HUD Component
 * Real-time overlay showing body language, voice, and engagement metrics
 */

import { useEffect, useState, useRef } from 'react';
import type { MultimodalMetrics } from '~/session-scoring/multimodal-processor.client';

interface MultimodalHUDProps {
  metrics: Partial<MultimodalMetrics> | null;
  showDetailed?: boolean;
}

interface MetricCardProps {
  label: string;
  value: number | string;
  threshold?: number;
  reverseThreshold?: boolean;
  unit?: string;
  icon?: string;
}

function MetricCard({ label, value, threshold = 70, reverseThreshold = false, unit = '%', icon }: MetricCardProps) {
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);
  const isGood = reverseThreshold
    ? numValue < threshold
    : numValue >= threshold;

  const colorClass = isGood
    ? 'bg-green-500/20 border-green-500 text-green-400'
    : 'bg-yellow-500/20 border-yellow-500 text-yellow-400';

  return (
    <div className={`px-3 py-2 rounded-lg border ${colorClass} backdrop-blur-sm`}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-lg">{icon}</span>}
        <div className="flex-1">
          <div className="text-xs opacity-80">{label}</div>
          <div className="text-lg font-bold">
            {typeof value === 'number' ? value.toFixed(0) : value}{unit}
          </div>
        </div>
        {!isGood && <span className="text-xl">⚠️</span>}
      </div>
    </div>
  );
}

export function MultimodalHUD({ metrics, showDetailed = false }: MultimodalHUDProps) {
  const [alerts, setAlerts] = useState<string[]>([]);
  const [showAlertBanner, setShowAlertBanner] = useState(false);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect anomalies and trigger alerts
  useEffect(() => {
    if (!metrics) return;

    const newAlerts: string[] = [];

    // Check thresholds
    if (metrics.eye_contact_percent !== undefined && metrics.eye_contact_percent < 50) {
      newAlerts.push('⚠️ Maintain eye contact');
    }
    if (metrics.voice_stress_level !== undefined && metrics.voice_stress_level > 0.7) {
      newAlerts.push('🧘 Take a breath - you\'re stressed');
    }
    if (metrics.posture_score !== undefined && metrics.posture_score < 40) {
      newAlerts.push('💪 Stand tall - improve posture');
    }
    if (metrics.speaking_pace !== undefined && metrics.speaking_pace > 180) {
      newAlerts.push('🐢 Slow down your speaking pace');
    }
    if (metrics.filler_word_count !== undefined && metrics.filler_word_count > 5) {
      newAlerts.push('🎯 Reduce filler words (um, uh, like)');
    }

    if (newAlerts.length > 0) {
      setAlerts(newAlerts);
      setShowAlertBanner(true);

      // Auto-hide after 5 seconds
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
      alertTimeoutRef.current = setTimeout(() => {
        setShowAlertBanner(false);
      }, 5000);
    }

    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, [metrics]);

  if (!metrics) {
    return (
      <div className="fixed top-4 right-4 bg-gray-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span className="text-sm">Initializing multimodal sensors...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Alert Banner */}
      {showAlertBanner && alerts.length > 0 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-slideDown">
          <div className="bg-yellow-500/90 backdrop-blur-md text-gray-900 px-6 py-3 rounded-lg shadow-2xl border-2 border-yellow-400">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                {alerts.map((alert, i) => (
                  <div key={i} className="text-sm font-semibold">{alert}</div>
                ))}
              </div>
              <button
                onClick={() => setShowAlertBanner(false)}
                className="ml-4 text-gray-700 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main HUD - Top Right */}
      <div className="fixed top-4 right-4 z-40 space-y-2 max-w-xs">
        {/* Status Indicator */}
        <div className="bg-gray-900/90 backdrop-blur-md text-white px-4 py-2 rounded-lg border border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-semibold">Live Monitoring</span>
          </div>
          <button
            onClick={() => {}}
            className="text-xs text-gray-400 hover:text-white"
          >
            {showDetailed ? '🔼' : '🔽'}
          </button>
        </div>

        {/* Composite Scores */}
        <div className="bg-gray-900/90 backdrop-blur-md rounded-lg border border-gray-700 p-3 space-y-2">
          <MetricCard
            label="Confidence"
            value={metrics.confidence_index ?? 0}
            icon="💪"
          />
          <MetricCard
            label="Engagement"
            value={metrics.engagement_score ?? 0}
            icon="🎯"
          />
        </div>

        {/* Body Language */}
        {showDetailed && (
          <>
            <div className="bg-gray-900/90 backdrop-blur-md rounded-lg border border-gray-700 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-400 mb-2">BODY LANGUAGE</div>
              <MetricCard
                label="Posture"
                value={metrics.posture_score ?? 0}
                icon="🧍"
              />
              <div className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500 text-blue-400 backdrop-blur-sm">
                <div className="text-xs opacity-80">Gesture</div>
                <div className="text-lg font-bold capitalize">
                  {metrics.gesture_state ?? 'neutral'}
                </div>
              </div>
            </div>

            {/* Facial */}
            <div className="bg-gray-900/90 backdrop-blur-md rounded-lg border border-gray-700 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-400 mb-2">FACIAL CUES</div>
              <MetricCard
                label="Eye Contact"
                value={metrics.eye_contact_percent ?? 0}
                icon="👁️"
              />
              <div className="px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500 text-purple-400 backdrop-blur-sm">
                <div className="text-xs opacity-80">Emotion</div>
                <div className="text-lg font-bold capitalize">
                  {metrics.emotion ?? 'neutral'}
                </div>
              </div>
            </div>

            {/* Voice */}
            <div className="bg-gray-900/90 backdrop-blur-md rounded-lg border border-gray-700 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-400 mb-2">VOICE ANALYSIS</div>
              <MetricCard
                label="Speaking Pace"
                value={metrics.speaking_pace ?? 0}
                unit=" WPM"
                threshold={160}
                reverseThreshold={true}
                icon="🗣️"
              />
              <MetricCard
                label="Stress Level"
                value={(metrics.voice_stress_level ?? 0) * 100}
                threshold={70}
                reverseThreshold={true}
                icon="💓"
              />
              <MetricCard
                label="Filler Words"
                value={metrics.filler_word_count ?? 0}
                unit=""
                threshold={5}
                reverseThreshold={true}
                icon="🎤"
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom Progress Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900/90 backdrop-blur-md border-t border-gray-700 p-3">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-4 gap-4 text-center text-white">
            <div>
              <div className="text-xs opacity-60">Confidence</div>
              <div className="text-2xl font-bold">{metrics.confidence_index?.toFixed(0) ?? 0}%</div>
              <div className="mt-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${metrics.confidence_index ?? 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs opacity-60">Eye Contact</div>
              <div className="text-2xl font-bold">{metrics.eye_contact_percent?.toFixed(0) ?? 0}%</div>
              <div className="mt-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${metrics.eye_contact_percent ?? 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs opacity-60">Posture</div>
              <div className="text-2xl font-bold">{metrics.posture_score?.toFixed(0) ?? 0}%</div>
              <div className="mt-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${metrics.posture_score ?? 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs opacity-60">Engagement</div>
              <div className="text-2xl font-bold">{metrics.engagement_score?.toFixed(0) ?? 0}%</div>
              <div className="mt-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-300"
                  style={{ width: `${metrics.engagement_score ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -100%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

export default MultimodalHUD;
