import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function ShieldIcon() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = 2.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
    }
  });

  // Shield shape using a custom path
  const shieldShape = new THREE.Shape();
  const w = 0.5;
  const h = 0.7;
  shieldShape.moveTo(0, h);
  shieldShape.quadraticCurveTo(w, h * 0.7, w, 0);
  shieldShape.quadraticCurveTo(w * 0.8, -h * 0.5, 0, -h);
  shieldShape.quadraticCurveTo(-w * 0.8, -h * 0.5, -w, 0);
  shieldShape.quadraticCurveTo(-w, h * 0.7, 0, h);

  return (
    <group ref={groupRef} position={[0, 2.2, 0]}>
      <mesh>
        <shapeGeometry args={[shieldShape]} />
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={0.6}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Shield outline */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={32}
            array={(() => {
              const points: number[] = [];
              for (let i = 0; i <= 31; i++) {
                const p = shieldShape.getPoint(i / 31);
                points.push(p.x, p.y, 0);
              }
              return new Float32Array(points);
            })()}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#007AFF" transparent opacity={0.6} />
      </line>
    </group>
  );
}

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -state.clock.elapsedTime * 0.3;
  });

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
        <primitive object={scene} scale={2} />
      </group>
      <ShieldIcon />
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
