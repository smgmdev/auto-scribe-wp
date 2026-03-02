import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, useMemo, Suspense, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function MissileModel() {
  const { scene } = useGLTF('/models/missile.glb');
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.3, 0, 0.1]}>
      <primitive object={scene} scale={1.5} />
    </group>
  );
}

function OrbitalRings() {
  const ringRef1 = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef1.current) {
      ringRef1.current.rotation.x = t * 0.4;
      ringRef1.current.rotation.z = t * 0.2;
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.y = t * 0.3;
      ringRef2.current.rotation.x = Math.PI / 3 + t * 0.15;
    }
  });

  return (
    <>
      <mesh ref={ringRef1}>
        <torusGeometry args={[2.2, 0.005, 8, 128]} />
        <meshStandardMaterial color="#007AFF" emissive="#007AFF" emissiveIntensity={1} transparent opacity={0.3} />
      </mesh>
      <mesh ref={ringRef2}>
        <torusGeometry args={[2.5, 0.004, 8, 128]} />
        <meshStandardMaterial color="#007AFF" emissive="#007AFF" emissiveIntensity={0.8} transparent opacity={0.2} />
      </mesh>
    </>
  );
}

function StarField({ missilePos }: { missilePos: React.MutableRefObject<THREE.Vector3> }) {
  const starsRef = useRef<THREE.Points>(null);
  const count = 400;
  
  const { positions, lifetimes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 100; // off-screen initially
      life[i] = Math.random(); // stagger initial lifetimes
    }
    return { positions: pos, lifetimes: life };
  }, []);

  useFrame((_, delta) => {
    if (!starsRef.current) return;
    const posAttr = starsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const mx = missilePos.current.x;
    const my = missilePos.current.y;
    const mz = missilePos.current.z;
    
    for (let i = 0; i < count; i++) {
      lifetimes[i] -= delta * (1.5 + Math.random() * 0.5);
      
      if (lifetimes[i] <= 0) {
        // Respawn at missile position with slight spread
        arr[i * 3] = mx + (Math.random() - 0.5) * 0.6;
        arr[i * 3 + 1] = my + (Math.random() - 0.5) * 0.6;
        arr[i * 3 + 2] = mz + (Math.random() - 0.5) * 0.3;
        lifetimes[i] = 0.8 + Math.random() * 1.2;
      } else {
        // Drift backward (trail behind missile)
        arr[i * 3] += (Math.random() - 0.5) * delta * 2;
        arr[i * 3 + 1] += (Math.random() - 0.5) * delta * 2;
        arr[i * 3 + 2] += delta * 3; // trail backward in Z
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={starsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#66aaff" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

function ScanGrid() {
  const gridRef = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const count = 300;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Flat grid plane with slight random depth
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (gridRef.current) {
      // Slow radar-sweep rotation
      gridRef.current.rotation.y = state.clock.elapsedTime * 0.15;
      // Subtle vertical pulse
      gridRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.2 - 1;
    }
  });

  return (
    <points ref={gridRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={300} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#007AFF" transparent opacity={0.35} sizeAttenuation />
    </points>
  );
}

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile.glb');
  useState(() => { onLoaded(); });
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(0);
  const missilePosRef = useRef(new THREE.Vector3(0, 2, 15));

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    phaseRef.current += delta;
    const cycle = phaseRef.current % 6;

    if (cycle < 3) {
      const p = cycle / 3;
      const e = p * p * (3 - 2 * p);
      groupRef.current.position.set(
        Math.sin(p * Math.PI * 0.5) * 1.5,
        Math.cos(p * Math.PI) * 0.5 + 0.5,
        THREE.MathUtils.lerp(15, -3, e)
      );
      groupRef.current.rotation.set(0.2, Math.PI + p * 0.3, Math.sin(p * Math.PI) * 0.15);
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.3, 2.8, e));
    } else if (cycle < 4.5) {
      const p = (cycle - 3) / 1.5;
      const e = p * p;
      groupRef.current.position.set(THREE.MathUtils.lerp(1.5, -2, p), 0.3, THREE.MathUtils.lerp(-3, -20, e));
      groupRef.current.rotation.set(-0.1, Math.PI + 0.3, -0.1);
      groupRef.current.scale.setScalar(THREE.MathUtils.lerp(2.8, 0.5, e));
    } else {
      groupRef.current.position.set(0, 2, 15);
      groupRef.current.scale.setScalar(0.01);
    }
    missilePosRef.current.copy(groupRef.current.position);
  });

  return (
    <>
      <group ref={groupRef}>
        <primitive object={scene} scale={2.5} />
      </group>
      <StarField missilePos={missilePosRef} />
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
      <Canvas camera={{ position: [0, 1, 5.5], fov: 45 }}>
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
