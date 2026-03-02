import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function TargetingReticle() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 2.5) * 0.12;
    groupRef.current.scale.set(scale, scale, scale);
    groupRef.current.rotation.z = Math.sin(t * 0.8) * 0.05;
  });

  const cornerSize = 0.6;
  const cornerThickness = 0.08;
  const offset = 1.4; // distance from center

  // Build an L-shaped corner
  const cornerGeo = useMemo(() => {
    const shape = new THREE.Shape();
    // vertical bar
    shape.moveTo(0, 0);
    shape.lineTo(cornerThickness, 0);
    shape.lineTo(cornerThickness, cornerSize);
    shape.lineTo(0, cornerSize);
    shape.lineTo(0, 0);
    // horizontal bar
    shape.moveTo(0, 0);
    shape.lineTo(cornerSize, 0);
    shape.lineTo(cornerSize, cornerThickness);
    shape.lineTo(0, cornerThickness);
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape);
  }, []);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f2a547',
    emissive: '#f2a547',
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  // 4 corners with rotations: TL, TR, BR, BL
  const corners = [
    { pos: [-offset, offset, 0] as [number, number, number], rot: 0 },           // top-left
    { pos: [offset, offset, 0] as [number, number, number], rot: Math.PI / 2 },   // top-right
    { pos: [offset, -offset, 0] as [number, number, number], rot: Math.PI },       // bottom-right
    { pos: [-offset, -offset, 0] as [number, number, number], rot: -Math.PI / 2 }, // bottom-left
  ];

  return (
    <group ref={groupRef} position={[0, 0.8, 0]}>
      {corners.map((c, i) => (
        <mesh key={i} geometry={cornerGeo} material={mat} position={c.pos} rotation={[0, 0, c.rot]} />
      ))}
      {/* Center dot */}
      <mesh position={[0, 0, 0]}>
        <circleGeometry args={[0.1, 24]} />
        <meshStandardMaterial color="#f2a547" emissive="#f2a547" emissiveIntensity={0.8} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* Inner corners (smaller) */}
      {corners.map((c, i) => (
        <mesh key={`inner-${i}`} geometry={cornerGeo} material={mat}
          position={[c.pos[0] * 0.45, c.pos[1] * 0.45, 0.01]}
          rotation={[0, 0, c.rot]}
          scale={0.5}
        />
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
      <TargetingReticle />
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
