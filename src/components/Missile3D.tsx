import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function ShieldDome() {
  const shieldRef = useRef<THREE.Mesh>(null);
  const hexRef = useRef<THREE.LineSegments>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (shieldRef.current) {
      const mat = shieldRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.06 + Math.sin(t * 1.5) * 0.03;
    }
    if (hexRef.current) {
      hexRef.current.rotation.y = t * 0.15;
      const mat = hexRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 2) * 0.08;
    }
  });

  // Create hex grid wireframe on a sphere
  const hexGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.2, 2);
    const edges = new THREE.EdgesGeometry(geo);
    return edges;
  }, []);

  return (
    <>
      {/* Translucent shield sphere */}
      <mesh ref={shieldRef}>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={0.3}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Hex wireframe overlay */}
      <lineSegments ref={hexRef} geometry={hexGeo}>
        <lineBasicMaterial color="#007AFF" transparent opacity={0.15} />
      </lineSegments>

      {/* Shield rim glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.01, 8, 64]} />
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={2}
          transparent
          opacity={0.3}
        />
      </mesh>
    </>
  );
}

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = -t * 0.3;
  });

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
        <primitive object={scene} scale={2} />
      </group>
      <ShieldDome />
    </>
  );
}

export default function Missile3D() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative w-full aspect-square">
      <div className="absolute inset-0 z-20 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 70% at center, transparent 30%, black 75%)',
      }} />
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
