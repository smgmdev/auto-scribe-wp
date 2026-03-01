import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { COUNTRY_COORDINATES, latLngToVector3 } from '@/constants/countryCoordinates';

interface MissileTrajectoryGlobeProps {
  originCode: string | null;
  destinationCode: string | null;
}

function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial
        color="#1a1a2e"
        emissive="#0a0a1a"
        roughness={0.8}
        metalness={0.2}
        wireframe={false}
      />
      {/* Wireframe overlay */}
      <mesh>
        <sphereGeometry args={[1.002, 24, 24]} />
        <meshBasicMaterial color="#2a2a4a" wireframe transparent opacity={0.3} />
      </mesh>
    </mesh>
  );
}

function CountryDot({ lat, lng, color }: { lat: number; lng: number; color: string }) {
  const pos = useMemo(() => latLngToVector3(lat, lng, 1.02), [lat, lng]);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.3;
      pulseRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function ArcTrajectory({ origin, destination }: { origin: [number, number, number]; destination: [number, number, number] }) {
  const missileRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo, glowTubeGeo } = useMemo(() => {
    const start = new THREE.Vector3(...origin);
    const end = new THREE.Vector3(...destination);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(1.6);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.004, 8, false);
    const glowTube = new THREE.TubeGeometry(c, 80, 0.008, 8, false);

    return { curve: c, tubeGeo: tube, glowTubeGeo: glowTube };
  }, [origin, destination]);

  useFrame(({ clock }) => {
    if (missileRef.current) {
      const t = (clock.getElapsedTime() * 0.3) % 1;
      const pos = curve.getPoint(t);
      missileRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.01, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      missileRef.current.quaternion.copy(quat);
    }
  });

  return (
    <group>
      <mesh geometry={glowTubeGeo}>
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.25} />
      </mesh>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} />
      </mesh>
      <mesh ref={missileRef}>
        <coneGeometry args={[0.035, 0.08, 8]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
    </group>
  );
}

export function MissileTrajectoryGlobe({ originCode, destinationCode }: MissileTrajectoryGlobeProps) {
  const originCoords = originCode ? COUNTRY_COORDINATES[originCode] : null;
  const destCoords = destinationCode ? COUNTRY_COORDINATES[destinationCode] : null;

  if (!originCoords || !destCoords) return null;

  const originPos = latLngToVector3(originCoords.lat, originCoords.lng, 1.02);
  const destPos = latLngToVector3(destCoords.lat, destCoords.lng, 1.02);

  return (
    <div className="w-full h-48 rounded-lg overflow-hidden bg-black/40 border border-blue-500/20">
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 3, 5]} intensity={0.8} />
        <Earth />
        <CountryDot lat={originCoords.lat} lng={originCoords.lng} color="#ef4444" />
        <CountryDot lat={destCoords.lat} lng={destCoords.lng} color="#3b82f6" />
        <ArcTrajectory origin={originPos} destination={destPos} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI * 3 / 4}
        />
      </Canvas>
      <div className="flex justify-between px-3 -mt-6 relative z-10 text-[10px] font-mono">
        <span className="text-red-400">⬤ {originCoords.name}</span>
        <span className="text-blue-400">{destCoords.name} ⬤</span>
      </div>
    </div>
  );
}
