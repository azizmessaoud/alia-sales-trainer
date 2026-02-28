/**
 * ALIA 2.0 - Session HUD Component
 * Real-time training session metrics and status display
 */

import { useState, useEffect } from 'react';

export interface SessionMetrics {
  accuracy: number;
  compliance: number;
  confidence: number;
  clarity: number;
}

export interface SessionHUDProps {
  metrics: SessionMetrics;
  sessionId: string;
  repName?: string;
  duration?: number;
  status?: 'active' | 'paused' | 'completed';
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
}

// Color thresholds
const getColor = (value: number): string => {
  if (value >= 80) return '#5cb85c'; // Green
  if (value >= 60) return '#f0ad4e'; // Yellow
  return '#d9534f'; // Red
};

export function SessionHUD({
  metrics,
  sessionId,
  repName = 'Trainee',
  duration = 0,
  status = 'active',
  onPause,
  onResume,
  onEnd,
}: SessionHUDProps) {
  const [elapsed, setElapsed] = useState(duration);
  const [showDetails, setShowDetails] = useState(false);
  
  // Timer
  useEffect(() => {
    if (status !== 'active') return;
    
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [status]);
  
  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Calculate overall score
  const overallScore = Math.round(
    (metrics.accuracy + metrics.compliance + metrics.confidence + metrics.clarity) / 4
  );
  
  return (
    <div className="session-hud" style={{
      backgroundColor: 'rgba(26, 26, 46, 0.95)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>
            {repName}
          </h3>
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px' }}>
            Session: {sessionId.slice(0, 8)}...
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Timer */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '8px 16px',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '18px',
            fontWeight: '600',
            fontFamily: 'monospace',
          }}>
            {formatTime(elapsed)}
          </div>
          
          {/* Status indicator */}
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: status === 'active' ? '#5cb85c' : status === 'paused' ? '#f0ad4e' : '#d9534f',
            animation: status === 'active' ? 'pulse 2s infinite' : 'none',
          }} />
        </div>
      </div>
      
      {/* Main metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '16px',
      }}>
        {/* Overall Score */}
        <div style={{
          gridColumn: 'span 4',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginBottom: '4px' }}>
            OVERALL SCORE
          </div>
          <div style={{
            fontSize: '32px',
            fontWeight: '700',
            color: getColor(overallScore),
          }}>
            {overallScore}%
          </div>
        </div>
        
        {/* Individual metrics */}
        {[
          { key: 'accuracy', label: 'Accuracy', value: metrics.accuracy },
          { key: 'compliance', label: 'Compliance', value: metrics.compliance },
          { key: 'confidence', label: 'Confidence', value: metrics.confidence },
          { key: 'clarity', label: 'Clarity', value: metrics.clarity },
        ].map((metric) => (
          <div key={metric.key} style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onClick={() => setShowDetails(!showDetails)}
          >
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '11px', marginBottom: '4px' }}>
              {metric.label}
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '600',
              color: getColor(metric.value),
            }}>
              {Math.round(metric.value)}%
            </div>
            {/* Progress bar */}
            <div style={{
              marginTop: '6px',
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${metric.value}%`,
                backgroundColor: getColor(metric.value),
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
      
      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
      }}>
        {status === 'active' ? (
          <button
            onClick={onPause}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: '1px solid rgba(240, 173, 78, 0.5)',
              backgroundColor: 'rgba(240, 173, 78, 0.1)',
              color: '#f0ad4e',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s ease',
            }}
          >
            ⏸ Pause
          </button>
        ) : (
          <button
            onClick={onResume}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: '1px solid rgba(92, 184, 92, 0.5)',
              backgroundColor: 'rgba(92, 184, 92, 0.1)',
              color: '#5cb85c',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s ease',
            }}
          >
            ▶ Resume
          </button>
        )}
        
        <button
          onClick={onEnd}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: '1px solid rgba(217, 83, 79, 0.5)',
            backgroundColor: 'rgba(217, 83, 79, 0.1)',
            color: '#d9534f',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s ease',
          }}
        >
          ⏹ End Session
        </button>
      </div>
      
      {/* Details panel */}
      {showDetails && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'rgba(255, 255, 255, 0.7)',
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>Session Details</h4>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Duration: {formatTime(elapsed)}</li>
            <li>Status: {status}</li>
            <li>Real-time metrics update every 5 seconds</li>
            <li>Compliance checked against FDA guidelines</li>
          </ul>
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default SessionHUD;
