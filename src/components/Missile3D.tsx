import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.3;
    groupRef.current.position.y = Math.sin(t * 0.6) * 0.15;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
      <primitive object={scene} scale={2} />
    </group>
  );
}

export default function Missile3D() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative w-full aspect-square bg-[#1d1d1f] rounded-2xl overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#007AFF] animate-spin" />
        </div>
      )}
      <Canvas camera={{ position: [0, 0.5, 5], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-3, -2, 4]} intensity={0.5} color="#aaccff" />
        <directionalLight position={[0, -3, 3]} intensity={0.4} color="#ffffff" />
        <pointLight position={[0, 2, 3]} intensity={0.8} color="#ffffff" />
        <Suspense fallback={null}>
          <SceneContent onLoaded={() => setLoading(false)} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/missile.glb');
