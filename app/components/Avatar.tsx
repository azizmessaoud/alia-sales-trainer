/**
 * ALIA 2.0 - 3D Avatar Component
 * Renders a 3D avatar with lip-sync animation
 * 
 * Uses Three.js for 3D rendering and viseme-based lip-sync
 * Only renders on client-side
 */

import { useEffect, useRef, useState, lazy, Suspense } from 'react';

// =====================================================
// Types
// =====================================================

export interface VisemeData {
  time: number;
  viseme: string;
}

export interface AvatarProps {
  visemes?: VisemeData[];
  isSpeaking?: boolean;
  emotion?: 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking';
  modelUrl?: string;
  className?: string;
}

// Viseme to morph target mapping
const VISEME_MORPH_MAP: Record<string, number[]> = {
  'sil': [0, 0, 0, 0, 0],
  'PP': [1, 0, 0, 0, 0],
  'FF': [0, 1, 0, 0, 0],
  'TH': [0, 0, 1, 0, 0],
  'DD': [0, 0, 0, 1, 0],
  'KK': [0, 0, 0, 0, 1],
  'CH': [0.5, 0, 0.5, 0, 0.5],
  'HH': [0, 0, 0, 0, 0],
  'RR': [0.3, 0, 0, 0.5, 0.3],
  'AA': [1, 0, 0, 0.5, 0],
  'EH': [0.8, 0, 0, 0.8, 0],
  'IH': [0.7, 0, 0, 0.7, 0],
  'UW': [0.8, 0, 0, 0, 0.8],
  'AH': [0.9, 0, 0, 0.3, 0],
  'OH': [0.9, 0, 0, 0.2, 0.5],
  'ER': [0.6, 0, 0, 0.8, 0.3],
};

// =====================================================
// Client-only Avatar implementation
// =====================================================

function AvatarCore({
  visemes = [],
  isSpeaking = false,
  emotion = 'neutral',
  className = ''
}: AvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const meshRef = useRef<any>(null);
  const animationRef = useRef<number>(0);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    let isMounted = true;
    
    async function initScene() {
      try {
        const THREE = await import('three');
        
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
        
        // Create avatar head (simple sphere)
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
        
        if (!isMounted) {
          renderer.dispose();
          return;
        }
        
        setIsLoaded(true);
        
        // Animation loop
        const animate = () => {
          if (!isMounted) return;
          
          animationRef.current = requestAnimationFrame(animate);
          
          // Idle animation - subtle breathing
          if (head) {
            head.rotation.y = Math.sin(Date.now() * 0.001) * 0.1;
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
      if (rendererRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(rendererRef.current.domElement);
        } catch (e) {}
        rendererRef.current.dispose();
      }
    };
  }, []);
  
  // Lip-sync animation
  useEffect(() => {
    if (!isLoaded || !meshRef.current || visemes.length === 0 || !isSpeaking) return;
    
    let currentIndex = 0;
    const startTime = Date.now();
    
    const animateVisemes = () => {
      const elapsed = Date.now() - startTime;
      
      while (currentIndex < visemes.length - 1 && visemes[currentIndex + 1].time * 1000 < elapsed) {
        currentIndex++;
      }
      
      const currentViseme = visemes[currentIndex]?.viseme || 'sil';
      const morphValues = VISEME_MORPH_MAP[currentViseme] || VISEME_MORPH_MAP['sil'];
      
      if (meshRef.current.morphTargetInfluences) {
        meshRef.current.morphTargetInfluences = morphValues;
      }
    };
    
    const interval = setInterval(animateVisemes, 50);
    
    return () => clearInterval(interval);
  }, [visemes, isLoaded, isSpeaking]);
  
  // Emotion changes
  useEffect(() => {
    if (!meshRef.current || !isLoaded) return;
    
    const colors: Record<string, number> = {
      neutral: 0x4a90d9,
      happy: 0x5cb85c,
      sad: 0x5bc0de,
      surprised: 0xf0ad4e,
      thinking: 0x9b59b6,
    };
    
    const material = meshRef.current.material as any;
    material.color.setHex(colors[emotion] || colors.neutral);
  }, [emotion, isLoaded]);

  return (
    <div className={`avatar-container ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Loading state */}
      {!isLoaded && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff'
        }}>
          Loading avatar...
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
}

// =====================================================
// Avatar Component (with loading state for SSR)
// =====================================================

export function Avatar(props: AvatarProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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

  return <AvatarCore {...props} />;
}

export default Avatar;
