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
  const count = 500;
  
  const { positions, velocities, lifetimes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = -999;
      vel[i * 3] = (Math.random() - 0.5) * 3;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 3;
      vel[i * 3 + 2] = 2 + Math.random() * 4;
      life[i] = 0;
    }
    return { positions: pos, velocities: vel, lifetimes: life };
  }, []);

  useFrame((_, delta) => {
    if (!starsRef.current) return;
    const posAttr = starsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const mx = missilePos.current.x;
    const my = missilePos.current.y;
    const mz = missilePos.current.z;

    // Only emit when missile is in visible range
    const missileVisible = mz < 10 && mz > -15;
    
    for (let i = 0; i < count; i++) {
      lifetimes[i] -= delta;
      
      if (lifetimes[i] <= 0) {
        if (missileVisible) {
          // Spawn at missile position
          arr[i * 3] = mx + (Math.random() - 0.5) * 0.8;
          arr[i * 3 + 1] = my + (Math.random() - 0.5) * 0.8;
          arr[i * 3 + 2] = mz + (Math.random() - 0.5) * 0.4;
          // Randomize velocity direction for this particle
          velocities[i * 3] = (Math.random() - 0.5) * 4;
          velocities[i * 3 + 1] = (Math.random() - 0.5) * 4;
          velocities[i * 3 + 2] = 3 + Math.random() * 5;
          lifetimes[i] = 0.3 + Math.random() * 0.8;
        } else {
          arr[i * 3 + 2] = -999; // hide
        }
      } else {
        // Move along velocity (trail behind)
        arr[i * 3] += velocities[i * 3] * delta;
        arr[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        arr[i * 3 + 2] += velocities[i * 3 + 2] * delta;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={starsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#ff8844" transparent opacity={0.8} sizeAttenuation />
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
    const cycle = phaseRef.current % 4;

    if (cycle < 3) {
      // Fly from left to right across the scene
      const p = cycle / 3; // 0 → 1
      const e = p * p * (3 - 2 * p); // smoothstep
      const x = THREE.MathUtils.lerp(-6, 6, e);
      const y = Math.sin(p * Math.PI) * 0.8 + 0.3; // gentle arc
      const z = 2 + Math.sin(p * Math.PI) * -1; // slight depth variation
      groupRef.current.position.set(x, y, z);
      // Rotate to face right (flying direction)
      groupRef.current.rotation.set(
        Math.sin(p * Math.PI) * -0.2, // slight nose pitch
        -Math.PI / 2, // face right
        Math.sin(p * Math.PI) * 0.15 // slight roll
      );
      groupRef.current.scale.setScalar(2);
    } else {
      // Brief reset
      groupRef.current.position.set(-6, 0.3, 2);
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
