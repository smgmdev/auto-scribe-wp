import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, Suspense, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

function ShieldIcon() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = 1.6 + Math.sin(state.clock.elapsedTime * 1.5) * 0.04;
    }
  });

  const shieldGeo = useMemo(() => {
    const shape = new THREE.Shape();
    // Shield path
    shape.moveTo(0, 0.55);
    shape.bezierCurveTo(0.35, 0.55, 0.5, 0.35, 0.5, 0.1);
    shape.bezierCurveTo(0.5, -0.15, 0.3, -0.4, 0, -0.6);
    shape.bezierCurveTo(-0.3, -0.4, -0.5, -0.15, -0.5, 0.1);
    shape.bezierCurveTo(-0.5, 0.35, -0.35, 0.55, 0, 0.55);
    return new THREE.ShapeGeometry(shape);
  }, []);

  const outlinePoints = useMemo(() => {
    const pts: number[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI * 2;
      // Parametric shield shape
      let x, y;
      if (t <= 0.25) {
        // top-right curve
        x = Math.sin(angle) * 0.5;
        y = 0.55 - (0.55 - 0.1) * (t / 0.25);
      } else if (t <= 0.5) {
        // bottom-right to bottom
        const lt = (t - 0.25) / 0.25;
        x = 0.5 * (1 - lt);
        y = 0.1 - 0.7 * lt;
      } else if (t <= 0.75) {
        // bottom to left
        const lt = (t - 0.5) / 0.25;
        x = -0.5 * lt;
        y = -0.6 + 0.7 * lt;
      } else {
        // left to top
        const lt = (t - 0.75) / 0.25;
        x = -0.5 * (1 - lt);
        y = 0.1 + (0.55 - 0.1) * lt;
      }
      pts.push(x, y, 0);
    }
    return new Float32Array(pts);
  }, []);

  return (
    <group ref={groupRef} position={[0, 1.6, 0]} scale={0.6}>
      {/* Shield fill */}
      <mesh geometry={shieldGeo}>
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={0.5}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Shield outline */}
      <mesh geometry={shieldGeo}>
        <meshStandardMaterial
          color="#007AFF"
          emissive="#007AFF"
          emissiveIntensity={1}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          wireframe
          depthWrite={false}
        />
      </mesh>
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
