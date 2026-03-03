import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile_UI.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -state.clock.elapsedTime * 0.3;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
      <primitive object={scene} scale={2} />
    </group>
  );
}

export default function Missile3D() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full aspect-square">
      {/* Vignette overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 70% at center, transparent 30%, black 75%)',
      }} />
      {/* Loading spinner */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#007AFF] animate-spin" />
        </div>
      )}
      {/* Canvas renders offscreen while loading, becomes visible when ready */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
        <Canvas camera={{ position: [0, 0.5, 5], fov: 45 }} frameloop={loaded ? 'always' : 'demand'}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
          <directionalLight position={[-3, -2, 4]} intensity={0.5} color="#aaccff" />
          <directionalLight position={[0, -3, 3]} intensity={0.4} color="#ffffff" />
          <pointLight position={[0, 2, 3]} intensity={0.8} color="#ffffff" />
          <Suspense fallback={null}>
            <SceneContent onLoaded={() => setLoaded(true)} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

useGLTF.preload('/models/missile_UI.glb');
