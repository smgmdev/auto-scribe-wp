import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function EnergyShield() {
  const outerRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const ringRefs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Outer hex grid rotates slowly
    if (outerRef.current) {
      outerRef.current.rotation.y = t * 0.1;
      outerRef.current.rotation.x = Math.sin(t * 0.3) * 0.05;
    }

    // Inner shell counter-rotates
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 0.15;
    }

    // Pulse ring expanding outward
    if (pulseRef.current) {
      const cycle = (t * 0.5) % 1; // 0→1 repeating
      const scale = 1.8 + cycle * 0.8;
      pulseRef.current.scale.setScalar(scale);
      const mat = pulseRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.25 * (1 - cycle);
    }

    // Orbital rings
    ringRefs.forEach((ref, i) => {
      if (ref.current) {
        const offset = (Math.PI * 2 / 3) * i;
        ref.current.rotation.x = t * 0.4 + offset;
        ref.current.rotation.z = t * 0.2 + offset;
        const mat = ref.current.material as THREE.MeshStandardMaterial;
        mat.opacity = 0.12 + Math.sin(t * 2 + i) * 0.06;
      }
    });
  });

  // Hex wireframe
  const hexEdges = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.0, 1);
    return new THREE.EdgesGeometry(geo);
  }, []);

  const innerEdges = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.7, 2);
    return new THREE.EdgesGeometry(geo);
  }, []);

  return (
    <>
      {/* Outer hex wireframe shell */}
      <group ref={outerRef}>
        <lineSegments geometry={hexEdges}>
          <lineBasicMaterial color="#007AFF" transparent opacity={0.18} />
        </lineSegments>
      </group>

      {/* Inner denser wireframe */}
      <group ref={innerRef}>
        <lineSegments geometry={innerEdges}>
          <lineBasicMaterial color="#007AFF" transparent opacity={0.08} />
        </lineSegments>
      </group>

      {/* Expanding pulse ring */}
      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.015, 4, 64]} />
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={2}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>

      {/* Three orbital defense rings */}
      {ringRefs.map((ref, i) => (
        <mesh key={i} ref={ref}>
          <torusGeometry args={[2.3 + i * 0.15, 0.004, 4, 80]} />
          <meshStandardMaterial
            color="#007AFF"
            emissive="#007AFF"
            emissiveIntensity={1.5}
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Subtle glow sphere */}
      <mesh>
        <sphereGeometry args={[2.0, 24, 24]} />
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={0.15}
          transparent
          opacity={0.03}
          side={THREE.BackSide}
          depthWrite={false}
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
    groupRef.current.rotation.y = -state.clock.elapsedTime * 0.3;
  });

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0]} rotation={[0.2, 0, 0.05]}>
        <primitive object={scene} scale={2} />
      </group>
      <EnergyShield />
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
