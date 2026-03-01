import { useRef, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import { COUNTRY_COORDINATES, latLngToVector3 } from '@/constants/countryCoordinates';

interface CountryData {
  code: string;
  name: string;
  threat_level: 'safe' | 'caution' | 'danger';
  score: number;
  summary: string;
  events: string[];
}

interface SurveillanceGlobeProps {
  countries: CountryData[];
  onCountryClick: (country: CountryData) => void;
  selectedCountry: string | null;
}

const GLOBE_RADIUS = 2;

function getThreatColor(level: string): string {
  switch (level) {
    case 'danger': return '#ef4444';
    case 'caution': return '#f59e0b';
    case 'safe':
    default: return '#22c55e';
  }
}

function GlobeGrid() {
  const gridLines = useMemo(() => {
    const lines: THREE.Vector3[][] = [];
    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = [];
      for (let lng = -180; lng <= 180; lng += 5) {
        const [x, y, z] = latLngToVector3(lat, lng, GLOBE_RADIUS + 0.005);
        points.push(new THREE.Vector3(x, y, z));
      }
      lines.push(points);
    }
    // Longitude lines
    for (let lng = -180; lng < 180; lng += 30) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        const [x, y, z] = latLngToVector3(lat, lng, GLOBE_RADIUS + 0.005);
        points.push(new THREE.Vector3(x, y, z));
      }
      lines.push(points);
    }
    return lines;
  }, []);

  return (
    <>
      {gridLines.map((points, i) => (
        <Line
          key={i}
          points={points.map(p => [p.x, p.y, p.z] as [number, number, number])}
          color="#1e3a5f"
          opacity={0.3}
          transparent
          lineWidth={0.5}
        />
      ))}
    </>
  );
}

function CountryMarker({ 
  country, 
  onClick,
  isSelected 
}: { 
  country: CountryData; 
  onClick: () => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const coords = COUNTRY_COORDINATES[country.code];
  if (!coords) return null;

  const position = latLngToVector3(coords.lat, coords.lng, GLOBE_RADIUS + 0.02);
  const color = getThreatColor(country.threat_level);
  const size = country.threat_level === 'danger' ? 0.06 : country.threat_level === 'caution' ? 0.045 : 0.03;

  return (
    <group position={position}>
      {/* Glow ring for active threats */}
      {country.threat_level !== 'safe' && (
        <mesh>
          <ringGeometry args={[size * 1.5, size * 2.5, 32]} />
          <meshBasicMaterial color={color} opacity={0.2} transparent side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Main dot */}
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[isSelected ? size * 1.5 : size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Pulse for danger */}
      {country.threat_level === 'danger' && <PulsingRing color={color} size={size} />}
    </group>
  );
}

function PulsingRing({ color, size }: { color: string; size: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.5;
      ref.current.scale.setScalar(scale);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.4 - scale * 0.12;
    }
  });
  return (
    <mesh ref={ref}>
      <ringGeometry args={[size * 2, size * 3, 32]} />
      <meshBasicMaterial color={color} opacity={0.3} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

function RotatingGlobe({ countries, onCountryClick, selectedCountry }: SurveillanceGlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useFrame(() => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += 0.001;
    }
  });

  const handleClick = useCallback((country: CountryData) => {
    setAutoRotate(false);
    onCountryClick(country);
    // Resume rotation after 10s
    setTimeout(() => setAutoRotate(true), 10000);
  }, [onCountryClick]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <group ref={groupRef}>
        {/* Globe sphere */}
        <mesh>
          <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
          <meshPhongMaterial
            color="#0a1628"
            emissive="#061020"
            specular="#1e3a5f"
            shininess={5}
            opacity={0.95}
            transparent
          />
        </mesh>
        {/* Grid */}
        <GlobeGrid />
        {/* Country markers */}
        {countries.map((country) => (
          <CountryMarker
            key={country.code}
            country={country}
            onClick={() => handleClick(country)}
            isSelected={selectedCountry === country.code}
          />
        ))}
      </group>
      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        autoRotate={false}
      />
    </>
  );
}

export function SurveillanceGlobe({ countries, onCountryClick, selectedCountry }: SurveillanceGlobeProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <RotatingGlobe
          countries={countries}
          onCountryClick={onCountryClick}
          selectedCountry={selectedCountry}
        />
      </Canvas>
    </div>
  );
}
