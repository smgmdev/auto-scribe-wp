import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function TargetLockRing({ radius, speed, color, opacity, reverse = false }: {
  radius: number; speed: number; color: string; opacity: number; reverse?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const dashRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.z = (reverse ? -1 : 1) * t * speed;
    // Pulse scale
    const pulse = 1 + Math.sin(t * 2) * 0.03;
    ref.current.scale.setScalar(pulse);
  });

  // Create dashed ring with gap segments
  const segments = 8;
  const gapRatio = 0.3;
  const arcAngle = (Math.PI * 2 / segments) * (1 - gapRatio);

  return (
    <group ref={ref}>
      {Array.from({ length: segments }).map((_, i) => {
        const startAngle = (Math.PI * 2 / segments) * i;
        return (
          <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius, 0.008, 4, 32, arcAngle]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.5}
              transparent
              opacity={opacity}
            />
            <group rotation={[0, 0, startAngle]}>
              <mesh>
                <torusGeometry args={[radius, 0.008, 4, 32, arcAngle]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={1.5}
                  transparent
                  opacity={opacity}
                />
              </mesh>
            </group>
          </mesh>
        );
      })}
    </group>
  );
}

function TargetReticle() {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (innerRef.current) {
      innerRef.current.rotation.z = t * 0.8;
      const s = 1 + Math.sin(t * 3) * 0.04;
      innerRef.current.scale.setScalar(s);
    }
    if (outerRef.current) {
      outerRef.current.rotation.z = -t * 0.4;
      const s = 1 + Math.sin(t * 2 + 1) * 0.03;
      outerRef.current.scale.setScalar(s);
    }
  });

  // Crosshair lines
  const crosshairMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#007AFF',
    emissive: '#007AFF',
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.5,
  }), []);

  return (
    <group ref={groupRef}>
      {/* Outer dashed ring */}
      <group ref={outerRef}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={`outer-${i}`} rotation={[Math.PI / 2, 0, (Math.PI * 2 / 6) * i]}>
            <torusGeometry args={[2.4, 0.006, 4, 16, Math.PI / 5]} />
            <meshStandardMaterial
              color="#007AFF"
              emissive="#007AFF"
              emissiveIntensity={1.2}
              transparent
              opacity={0.25}
            />
          </mesh>
        ))}
      </group>

      {/* Inner dashed ring */}
      <group ref={innerRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={`inner-${i}`} rotation={[Math.PI / 2, 0, (Math.PI / 2) * i]}>
            <torusGeometry args={[1.6, 0.008, 4, 20, Math.PI / 3.5]} />
            <meshStandardMaterial
              color="#007AFF"
              emissive="#007AFF"
              emissiveIntensity={1.8}
              transparent
              opacity={0.4}
            />
          </mesh>
        ))}
      </group>

      {/* Crosshair lines */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <mesh
          key={`cross-${i}`}
          position={[Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0]}
          rotation={[0, 0, angle]}
        >
          <boxGeometry args={[0.5, 0.003, 0.003]} />
          <primitive object={crosshairMat} attach="material" />
        </mesh>
      ))}

      {/* Center dot */}
      <mesh>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color="#ff3b30"
          emissive="#ff3b30"
          emissiveIntensity={3}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

function ScanGrid() {
  const gridRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const count = 200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (gridRef.current) {
      gridRef.current.rotation.y = state.clock.elapsedTime * 0.1;
      gridRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.2 - 1.2;
    }
  });

  return (
    <points ref={gridRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={200} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.012} color="#007AFF" transparent opacity={0.25} sizeAttenuation />
    </points>
  );
}

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    // Slow rotation
    groupRef.current.rotation.y = t * 0.3;
    // Gentle hover
    groupRef.current.position.y = Math.sin(t * 0.6) * 0.15;
  });

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
        <primitive object={scene} scale={2} />
      </group>
      <TargetReticle />
      <ScanGrid />
    </>
  );
}

export default function Missile3D() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#007AFF] animate-spin" />
        </div>
      )}
      <Canvas camera={{ position: [0, 0.5, 5], fov: 45 }}>
        <ambientLight intensity={0.15} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} color="#ffffff" />
        <directionalLight position={[-3, -2, 4]} intensity={0.3} color="#007AFF" />
        <pointLight position={[0, 2, 2]} intensity={0.5} color="#007AFF" />
        <Suspense fallback={null}>
          <SceneContent onLoaded={() => setLoading(false)} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/missile.glb');
