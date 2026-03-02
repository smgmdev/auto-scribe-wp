import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function PumpingLock() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const scale = 1 + Math.sin(t * 2.5) * 0.15;
    groupRef.current.scale.set(scale, scale, scale);
    groupRef.current.position.y = 2.2 + Math.sin(t * 1.5) * 0.05;
  });

  // Lock body (rounded rectangle)
  const bodyGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const w = 0.35, h = 0.3, r = 0.06;
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    return new THREE.ShapeGeometry(shape);
  }, []);

  // Lock shackle (U-shape arc)
  const shackleGeo = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, 0.2, 0.25, 0, Math.PI, false, 0);
    const points = curve.getPoints(32);
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, 0)));
    return geo;
  }, []);

  return (
    <group ref={groupRef} position={[0, 2.2, 0]}>
      {/* Lock body */}
      <mesh geometry={bodyGeo} position={[0, -0.15, 0]}>
        <meshStandardMaterial
          color="#f2a547"
          emissive="#f2a547"
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Lock shackle - rendered as thin tube */}
      <group position={[0, 0.15, 0]}>
        <mesh>
          <torusGeometry args={[0.2, 0.02, 8, 32, Math.PI]} />
          <meshStandardMaterial color="#f2a547" emissive="#f2a547" emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* Keyhole */}
      <mesh position={[0, -0.1, 0.01]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.2, 0.01]}>
        <planeGeometry args={[0.04, 0.1]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      {/* Glow ring */}
      <mesh position={[0, -0.05, -0.01]}>
        <ringGeometry args={[0.5, 0.55, 32]} />
        <meshStandardMaterial
          color="#f2a547"
          emissive="#f2a547"
          emissiveIntensity={0.8}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
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
      <PumpingLock />
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
