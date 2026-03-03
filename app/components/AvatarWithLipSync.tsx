/**
 * Example: Lip-Sync Integration with Avatar
 * Shows how to use NVIDIA Audio2Face with the 3D Avatar component
 * 
 * Usage flow:
 * 1. Record audio or receive audio stream
 * 2. Send audio to NVIDIA Audio2Face API (with fallback mock data)
 * 3. Get blendshape animation data back
 * 4. Play animation on Avatar via ref
 */

import { useRef, useEffect, useState } from 'react';
import { Avatar, AvatarHandle } from '~/components/Avatar';
import { generateLipSync, type Audio2FaceBlendshape } from '~/lib/nvidia-nim.server';

interface LipSyncIntegrationProps {
  audioBuffer?: Buffer;
  audioUrl?: string;
  onLipSyncStart?: () => void;
  onLipSyncEnd?: () => void;
}

export function AvatarWithLipSync({
  audioBuffer,
  audioUrl,
  onLipSyncStart,
  onLipSyncEnd,
}: LipSyncIntegrationProps) {
  const avatarRef = useRef<AvatarHandle>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lipSyncData, setLipSyncData] = useState<Audio2FaceBlendshape[] | null>(null);

  // Load and play audio with synchronized lip-sync
  useEffect(() => {
    if (!audioBuffer || !avatarRef.current) return;

    const playAudioWithLipSync = async () => {
      try {
        setIsProcessing(true);
        setError(null);

        console.log('🎤 Starting audio processing...');
        onLipSyncStart?.();

        // Get lip-sync blendshapes from NVIDIA Audio2Face
        const blendshapeData = await generateLipSync(audioBuffer);
        console.log(
          `✅ Lip-sync generated: ${blendshapeData.length} frames, ${(blendshapeData[blendshapeData.length - 1]?.timestamp / 1000).toFixed(2)}s duration`
        );

        setLipSyncData(blendshapeData);

        // Play lip-sync animation
        avatarRef.current?.playLipSync(blendshapeData, 0);

        // Play audio element if available
        if (audioElementRef.current) {
          audioElementRef.current.play().catch((err) => {
            console.warn('⚠️  Could not auto-play audio:', err.message);
          });
        }

        setIsProcessing(false);
        onLipSyncEnd?.();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred';
        console.error('❌ Failed to process audio:', errorMessage);
        setError(errorMessage);
        setIsProcessing(false);
      }
    };

    playAudioWithLipSync();
  }, [audioBuffer, onLipSyncStart, onLipSyncEnd]);

  // Manual blendshape application example
  const applyBlendshapes = (blendshapes: Record<string, number>) => {
    if (avatarRef.current) {
      avatarRef.current.applyBlendshapes(blendshapes);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* 3D Avatar with lip-sync support */}
      <Avatar
        ref={avatarRef}
        modelUrl="/avatar.glb"
        emotion="neutral"
        isSpeaking={isProcessing || (avatarRef.current?.getLipSyncPlaying() ?? false)}
      />

      {/* Hidden audio element (if needed) */}
      {audioUrl && <audio ref={audioElementRef} src={audioUrl} />}

      {/* Loading state */}
      {isProcessing && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            padding: '20px 30px',
            borderRadius: '8px',
            textAlign: 'center',
            zIndex: 200,
          }}
        >
          <div style={{ fontSize: '16px', marginBottom: '10px' }}>🎤 Processing audio...</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>Generating lip-sync animation</div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 107, 107, 0.9)',
            color: '#fff',
            padding: '20px 30px',
            borderRadius: '8px',
            textAlign: 'center',
            zIndex: 200,
          }}
        >
          <div style={{ fontSize: '16px', marginBottom: '5px' }}>⚠️ Error</div>
          <div style={{ fontSize: '12px' }}>{error}</div>
          <button
            onClick={() => setError(null)}
            style={{
              marginTop: '10px',
              padding: '5px 15px',
              backgroundColor: '#fff',
              color: '#d84a4a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Debug controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          padding: '10px 15px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 100,
        }}
      >
        <p style={{ margin: '0 0 8px 0' }}>
          🎬 Status:{' '}
          {isProcessing
            ? 'Processing...'
            : avatarRef.current?.getLipSyncPlaying()
              ? 'Playing'
              : 'Idle'}
        </p>
        {lipSyncData && (
          <p style={{ margin: '0 0 8px 0', fontSize: '11px', opacity: 0.8 }}>
            📊 {lipSyncData.length} frames | {(lipSyncData[lipSyncData.length - 1]?.timestamp / 1000).toFixed(2)}s
          </p>
        )}
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => avatarRef.current?.pauseLipSync()}
            disabled={isProcessing}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              backgroundColor: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Pause
          </button>
          <button
            onClick={() => avatarRef.current?.stopLipSync()}
            disabled={isProcessing}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              backgroundColor: '#d84a4a',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}

export default AvatarWithLipSync;
