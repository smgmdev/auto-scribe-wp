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
    groupRef.current.position.y = 0.8 + Math.sin(t * 1.5) * 0.06;
  });

  const orange = '#f2a547';

  // Lock body shape
  const bodyGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const w = 1.0, h = 0.85, r = 0.12;
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

  // Body outline only (wireframe edges)
  const bodyEdges = useMemo(() => {
    const shape = new THREE.Shape();
    const w = 1.0, h = 0.85, r = 0.12;
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const pts = shape.getPoints(64);
    return new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
  }, []);

  return (
    <group ref={groupRef} position={[0, 0.8, 0]}>
      {/* Lock body fill — subtle */}
      <mesh geometry={bodyGeo} position={[0, -0.4, 0]}>
        <meshStandardMaterial
          color={orange} emissive={orange} emissiveIntensity={0.3}
          transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>
      {/* Lock body outline */}
      <lineSegments geometry={bodyEdges} position={[0, -0.4, 0]}>
        <lineBasicMaterial color={orange} transparent opacity={0.7} />
      </lineSegments>

      {/* Shackle (U-shaped arc on top) */}
      <group position={[0, 0.45, 0]} rotation={[0, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.55, 0.045, 16, 48, Math.PI]} />
          <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.6} />
        </mesh>
        {/* Left shackle leg */}
        <mesh position={[-0.55, -0.25, 0]}>
          <boxGeometry args={[0.09, 0.5, 0.09]} />
          <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.6} />
        </mesh>
        {/* Right shackle leg */}
        <mesh position={[0.55, -0.25, 0]}>
          <boxGeometry args={[0.09, 0.5, 0.09]} />
          <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Keyhole circle */}
      <mesh position={[0, -0.25, 0.02]}>
        <ringGeometry args={[0.08, 0.15, 24]} />
        <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.8}
          transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Keyhole slot */}
      <mesh position={[0, -0.45, 0.02]}>
        <planeGeometry args={[0.08, 0.25]} />
        <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.8}
          transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Outer glow */}
      <mesh position={[0, 0, -0.02]}>
        <ringGeometry args={[1.6, 1.75, 48]} />
        <meshStandardMaterial color={orange} emissive={orange} emissiveIntensity={0.6}
          transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
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
