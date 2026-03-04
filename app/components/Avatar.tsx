/**
 * ALIA 2.0 - 3D Avatar Component
 * Renders a 3D avatar with lip-sync animation
 * 
 * Uses Three.js for 3D rendering
 * Loads GLB models with support for morph targets/blendshapes
 * Supports Audio2Face-3D lip-sync via blendshape animation
 * Only renders on client-side
 */

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useImperativeHandle, forwardRef } from 'react';
import LipSyncAnimator from '~/lib/lip-sync-animator.client';

// =====================================================
// Types
// =====================================================

/** @deprecated — pass blendshape frames via playLipSync() instead */
export interface VisemeData {
  time: number;
  viseme: string;
}

export interface AvatarProps {
  isSpeaking?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';
  modelUrl?: string;
  className?: string;
}

// VISEME_MORPH_MAP and ARKIT_BLENDSHAPES removed — LipSyncAnimator is the
// sole driver of morph targets, using ARKit blendshape frames clocked to
// the <audio> element's currentTime. See lib/lip-sync-animator.client.ts.

// =====================================================
// Avatar Instance Methods (for parent control)
// =====================================================

export interface AvatarHandle {
  playLipSync: (blendshapeData: any[], startTime?: number) => void;
  pauseLipSync: () => void;
  stopLipSync: () => void;
  applyBlendshapes: (blendshapes: Record<string, number>) => void;
  getLipSyncDuration: () => number;
  getLipSyncPlaying: () => boolean;
  /** Pass the <audio> element so LipSyncAnimator uses it as the master clock */
  setAudioElement: (el: HTMLAudioElement | null) => void;
}

// =====================================================
// Client-only Avatar implementation
// =====================================================

export const AvatarCore = forwardRef<AvatarHandle, AvatarProps>(
  (
    {
      isSpeaking = false,
      emotion = 'neutral',
      modelUrl = '/avatar.glb',
      className = ''
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<any>(null);
    const sceneRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const meshRef = useRef<any>(null);
    const allMorphMeshesRef = useRef<any[]>([]);
    const animationRef = useRef<number>(0);
    const modelRef = useRef<any>(null);
    const lipSyncAnimatorRef = useRef<LipSyncAnimator | null>(null);
    
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usesFallback, setUsesFallback] = useState(false);

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      playLipSync: (blendshapeData: any[], startTime: number = 0) => {
        if (!blendshapeData.length || !meshRef.current) return;

        // Ensure animator exists (fallback if model load didn't create it)
        if (!lipSyncAnimatorRef.current) {
          const additionalMeshes = allMorphMeshesRef.current.filter((m: any) => m !== meshRef.current);
          lipSyncAnimatorRef.current = new LipSyncAnimator({
            mesh: meshRef.current,
            additionalMeshes,
            smoothing: 0.35,
          });
          lipSyncAnimatorRef.current.debugLogBlendshapes();
        }

        lipSyncAnimatorRef.current.setBlendshapeData(blendshapeData);
        lipSyncAnimatorRef.current.setIsSpeaking(true);
        // Pre-set speakingFactor to 1 so first frames are immediately visible
        (lipSyncAnimatorRef.current as any).speakingFactor = 1;
        lipSyncAnimatorRef.current.play(startTime);
      },
      pauseLipSync: () => {
        lipSyncAnimatorRef.current?.setIsSpeaking(false);
        lipSyncAnimatorRef.current?.pause();
      },
      stopLipSync: () => {
        lipSyncAnimatorRef.current?.setIsSpeaking(false);
        lipSyncAnimatorRef.current?.stop();
      },
      applyBlendshapes: (blendshapes: Record<string, number>) => {
        applyBlendshapesToMesh(blendshapes);
      },
      getLipSyncDuration: () => {
        return lipSyncAnimatorRef.current?.getDuration?.() ?? 0;
      },
      getLipSyncPlaying: () => {
        return lipSyncAnimatorRef.current?.getIsPlaying?.() ?? false;
      },
      setAudioElement: (el: HTMLAudioElement | null) => {
        // Create animator lazily if mesh is ready but animator isn't yet
        if (el && meshRef.current && !lipSyncAnimatorRef.current) {
          lipSyncAnimatorRef.current = new LipSyncAnimator({
            mesh: meshRef.current,
            smoothing: 0.35,
          });
          lipSyncAnimatorRef.current.debugLogBlendshapes();
        }
        lipSyncAnimatorRef.current?.setAudioElement(el);
      },
    }), []);

    // Apply blendshapes directly to mesh (without LipSyncAnimator)
    const applyBlendshapesToMesh = (blendshapes: Record<string, number>) => {
      if (!meshRef.current?.morphTargetInfluences) return;

      const morphTargetDictionary = meshRef.current.morphTargetDictionary || {};
      
      for (const [blendshapeName, value] of Object.entries(blendshapes)) {
        if (blendshapeName in morphTargetDictionary) {
          const index = morphTargetDictionary[blendshapeName];
          if (index >= 0 && index < meshRef.current.morphTargetInfluences.length) {
            meshRef.current.morphTargetInfluences[index] = Math.max(
              0,
              Math.min(1, value)
            );
          }
        }
      }
    };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    let isMounted = true;
    
    async function initScene() {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        
        if (!isMounted || !containerRef.current) return;
        
        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        sceneRef.current = scene;
        
        // Camera
        const camera = new THREE.PerspectiveCamera(
          50,
          containerRef.current.clientWidth / containerRef.current.clientHeight,
          0.1,
          1000
        );
        camera.position.z = 5;
        cameraRef.current = camera;
        
        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
        
        const backLight = new THREE.DirectionalLight(0x4a90d9, 0.5);
        backLight.position.set(-5, -5, -5);
        scene.add(backLight);
        
        // Load GLB Model
        const loader = new GLTFLoader();
        
        loader.load(
          modelUrl,
          // Success callback
          (gltf) => {
            if (!isMounted) return;
            
            console.log('✅ GLB model loaded successfully');
            const model = gltf.scene;
            
            // Center and scale the model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim; // Scale to fit in view
            model.scale.setScalar(scale);
            
            model.position.sub(center.multiplyScalar(scale));
            model.position.y -= 0.5; // Adjust vertical position
            
            // Zoom camera to head / upper-body (bust shot)
            const scaledHeight = size.y * scale;
            const headY = -0.5 + scaledHeight * 0.35;
            camera.position.set(0, headY + 0.15, 1.8);
            camera.lookAt(0, headY, 0);
            camera.updateProjectionMatrix();
            
            scene.add(model);
            modelRef.current = model;
            
            // Find meshes with morph targets for lip-sync
            let morphTargetCount = 0;
            const availableTargets: string[] = [];
            allMorphMeshesRef.current = [];
            
            model.traverse((child: any) => {
              if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
                allMorphMeshesRef.current.push(child);
                meshRef.current = child; // last mesh wins (Wolf3D_Teeth)
                morphTargetCount++;
                const targets = Object.keys(child.morphTargetDictionary);
                availableTargets.push(...targets);
                
                console.log(`✅ Mesh "${child.name}" - ${targets.length} morph targets`);
                console.log(`   Targets: ${targets.slice(0, 10).join(', ')}${targets.length > 10 ? '...' : ''}`);
              }
            });

            // Use Wolf3D_Head as primary (contains the most relevant jaw/mouth geometry)
            // Fall back to first available mesh if Wolf3D_Head not found
            const primaryMesh =
              allMorphMeshesRef.current.find((m: any) => m.name === 'Wolf3D_Head') ??
              allMorphMeshesRef.current[0];
            if (primaryMesh) {
              meshRef.current = primaryMesh;
              const additionalMeshes = allMorphMeshesRef.current.filter((m: any) => m !== primaryMesh);
              lipSyncAnimatorRef.current = new LipSyncAnimator({
                mesh: primaryMesh,
                additionalMeshes,
                smoothing: 0.35,
              });
              lipSyncAnimatorRef.current.debugLogBlendshapes();
            }
            
            if (morphTargetCount > 0) {
              console.log(`✅ Model ready: ${morphTargetCount} mesh(es) with animation support`);
              console.log(`   Total unique targets: ${new Set(availableTargets).size}`);
            } else {
              console.warn('⚠️  Model loaded but no morph targets found - static avatar only');
            }
            
            setIsLoaded(true);
            setUsesFallback(false);
          },
          // Progress callback
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading model: ${percent.toFixed(0)}%`);
          },
          // Error callback - fallback to sphere
          (err) => {
            const error = err as Error;
            console.warn('⚠️  GLB model loading failed, using fallback sphere:', error.message);
            
            if (!isMounted) return;
            
            // Create fallback avatar (simple sphere)
            const geometry = new THREE.SphereGeometry(1.5, 32, 32);
            
            // Create morph targets for visemes
            const morphAttributes: number[][] = [];
            const positions = geometry.attributes.position;
            
            for (let i = 0; i < 5; i++) {
              const morphPositions = [];
              for (let j = 0; j < positions.count; j++) {
                const x = positions.getX(j);
                const y = positions.getY(j);
                const z = positions.getZ(j);
                
                if (y < 0) {
                  morphPositions.push(x * (1 + i * 0.1), y * (1 - i * 0.15), z * (1 + i * 0.05));
                } else {
                  morphPositions.push(x, y, z);
                }
              }
              morphAttributes.push(morphPositions);
            }
            
            geometry.morphAttributes.position = morphAttributes.map(pos => 
              new THREE.Float32BufferAttribute(pos, 3)
            );
            
            const material = new THREE.MeshStandardMaterial({
              color: 0x4a90d9,
              roughness: 0.5,
              metalness: 0.1,
            });
            
            const head = new THREE.Mesh(geometry, material);
            head.name = 'avatarHead';
            scene.add(head);
            meshRef.current = head;
            modelRef.current = head;
            
            // Eyes
            const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const pupilGeometry = new THREE.SphereGeometry(0.08, 16, 16);
            const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
            
            // Left eye
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.4, 0.3, 1.3);
            scene.add(leftEye);
            
            const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            leftPupil.position.set(-0.4, 0.3, 1.45);
            scene.add(leftPupil);
            
            // Right eye
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.4, 0.3, 1.3);
            scene.add(rightEye);
            
            const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            rightPupil.position.set(0.4, 0.3, 1.45);
            scene.add(rightPupil);
            
            setIsLoaded(true);
            setUsesFallback(true);
          }
        );
        
        if (!isMounted) {
          renderer.dispose();
          return;
        }
        
        // Animation loop
        const animate = () => {
          if (!isMounted) return;
          
          animationRef.current = requestAnimationFrame(animate);
          
          // Idle animation - subtle movement
          if (modelRef.current) {
            modelRef.current.rotation.y = Math.sin(Date.now() * 0.0005) * 0.05;
          }

          // 🔴 TEMP jitter test: oscillate jawOpen so we can confirm the mesh
          // can visually animate independent of LipSyncAnimator. REMOVE once confirmed.
          if (meshRef.current?.morphTargetInfluences && meshRef.current.morphTargetDictionary) {
            const jawIdx = (meshRef.current.morphTargetDictionary as Record<string, number>)['jawOpen'] ?? -1;
            if (jawIdx >= 0) {
              const v = Math.abs(Math.sin(Date.now() * 0.004)); // ~0.6Hz jaw chew
              meshRef.current.morphTargetInfluences[jawIdx] = v;
              // mirror to other meshes
              for (const m of allMorphMeshesRef.current) {
                if (m !== meshRef.current && m.morphTargetInfluences && m.morphTargetInfluences.length > jawIdx) {
                  m.morphTargetInfluences[jawIdx] = v;
                }
              }
            }
          }
          
          renderer.render(scene, camera);
        };
        animate();
        
        // Handle resize
        const handleResize = () => {
          if (!containerRef.current || !camera || !renderer) return;
          
          camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        
        window.addEventListener('resize', handleResize);
        
        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (err) {
        console.error('Avatar initialization error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize avatar');
        }
      }
    }
    
    initScene();
    
    return () => {
      isMounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lipSyncAnimatorRef.current?.stop();
      if (rendererRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (e) {}
        rendererRef.current.dispose();
      }
    };
  }, [modelUrl]);

  // Drive speaking envelope when prop changes
  useEffect(() => {
    lipSyncAnimatorRef.current?.setIsSpeaking(isSpeaking);
  }, [isSpeaking]);
  
  // Emotion changes
  useEffect(() => {
    if (!modelRef.current || !isLoaded) return;
    
    const colors: Record<string, number> = {
      neutral: 0x4a90d9,
      happy: 0x5cb85c,
      sad: 0x5bc0de,
      surprised: 0xf0ad4e,
      thinking: 0x9b59b6,
    };
    
    // Only apply color changes if using fallback sphere
    if (usesFallback && meshRef.current) {
      const material = meshRef.current.material as any;
      if (material && material.color) {
        material.color.setHex(colors[emotion] || colors.neutral);
      }
    } else {
      // For GLB models, you could animate scale or add particle effects
      console.log(`Emotion changed to: ${emotion}`);
    }
  }, [emotion, isLoaded, usesFallback]);

  return (
    <div className={`avatar-container ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Model info badge */}
      {isLoaded && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          backgroundColor: usesFallback ? 'rgba(255, 193, 7, 0.8)' : 'rgba(92, 184, 92, 0.8)',
          color: '#fff',
          fontFamily: 'monospace'
        }}>
          {usesFallback ? '⚠️ Fallback' : '✓ GLB Loaded'}
        </div>
      )}
      
      {/* Loading state */}
      {!isLoaded && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '10px' }}>Loading 3D avatar...</div>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>Loading model.glb</div>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff6b6b',
          textAlign: 'center'
        }}>
          <p>Avatar unavailable</p>
          <small>{error}</small>
        </div>
      )}
      
      {/* Speaking indicator */}
      {isSpeaking && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '4px'
        }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#5cb85c',
                animation: `pulse 1s infinite ${i * 0.2}s`
              }}
            />
          ))}
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
});

// =====================================================
// Avatar Component (with loading state for SSR)
// =====================================================

export const Avatar = forwardRef<AvatarHandle, AvatarProps>((props, ref) => {
  const [isClient, setIsClient] = useState(false);
  const avatarRef = useRef<AvatarHandle>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Forward the ref to the actual AvatarCore
  useImperativeHandle(ref, () => avatarRef.current || {
    playLipSync: () => {},
    pauseLipSync: () => {},
    stopLipSync: () => {},
    applyBlendshapes: () => {},
    getLipSyncDuration: () => 0,
    getLipSyncPlaying: () => false,
    setAudioElement: () => {},
  }, []);

  if (!isClient) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        backgroundColor: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }}>
        Loading...
      </div>
    );
  }

  return <AvatarCore ref={avatarRef} {...props} />;
});

Avatar.displayName = 'Avatar';

export default Avatar;
