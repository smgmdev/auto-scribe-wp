import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function TargetOverlay() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 2.5) * 0.1;
    groupRef.current.scale.set(scale, scale, scale);
    groupRef.current.rotation.z = Math.sin(t * 0.6) * 0.03;
  });

  const orange = '#da8e5a';
  const s = 1.5; // half-size of outer square

  // Square outline from line segments
  const outerSquare = useMemo(() => {
    const pts = [
      new THREE.Vector3(-s, -s, 0), new THREE.Vector3(s, -s, 0),
      new THREE.Vector3(s, -s, 0), new THREE.Vector3(s, s, 0),
      new THREE.Vector3(s, s, 0), new THREE.Vector3(-s, s, 0),
      new THREE.Vector3(-s, s, 0), new THREE.Vector3(-s, -s, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return geo;
  }, []);

  const si = 0.7; // half-size of inner square
  const innerSquare = useMemo(() => {
    const pts = [
      new THREE.Vector3(-si, -si, 0), new THREE.Vector3(si, -si, 0),
      new THREE.Vector3(si, -si, 0), new THREE.Vector3(si, si, 0),
      new THREE.Vector3(si, si, 0), new THREE.Vector3(-si, si, 0),
      new THREE.Vector3(-si, si, 0), new THREE.Vector3(-si, -si, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Outer square */}
      <lineSegments geometry={outerSquare}>
        <lineBasicMaterial color={orange} transparent opacity={0.8} />
      </lineSegments>
      {/* Inner square */}
      <lineSegments geometry={innerSquare}>
        <lineBasicMaterial color={orange} transparent opacity={0.5} />
      </lineSegments>
      {/* Center dot */}
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[0.08, 24]} />
        <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.9}
          transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* Crosshair lines (top, right, bottom, left) */}
      {[
        { pos: [0, (s + si) / 2, 0] as [number, number, number], size: [0.04, s - si - 0.08] as [number, number] },
        { pos: [(s + si) / 2, 0, 0] as [number, number, number], size: [s - si - 0.08, 0.04] as [number, number] },
        { pos: [0, -(s + si) / 2, 0] as [number, number, number], size: [0.04, s - si - 0.08] as [number, number] },
        { pos: [-(s + si) / 2, 0, 0] as [number, number, number], size: [s - si - 0.08, 0.04] as [number, number] },
      ].map((line, i) => (
        <mesh key={i} position={line.pos}>
          <planeGeometry args={line.size} />
          <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.7}
            transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF('/models/missile_UI.glb');
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

useGLTF.preload('/models/missile_UI.glb');
