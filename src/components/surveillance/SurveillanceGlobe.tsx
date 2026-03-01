import { useRef, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
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

function getThreatGlow(level: string): string {
  switch (level) {
    case 'danger': return '#ff000080';
    case 'caution': return '#ff990060';
    case 'safe':
    default: return '#00ff0040';
  }
}

function EarthSphere() {
  const texture = useLoader(THREE.TextureLoader, '/textures/earth-blue-marble.jpg');
  const bumpMap = useLoader(THREE.TextureLoader, '/textures/earth-topology.png');

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <meshPhongMaterial
        map={texture}
        bumpMap={bumpMap}
        bumpScale={0.04}
        specular={new THREE.Color('#1a3a5c')}
        shininess={8}
      />
    </mesh>
  );
}

function AtmosphereGlow() {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
  }, []);

  return (
    <mesh material={atmosphereMaterial}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.12, 64, 64]} />
    </mesh>
  );
}

function CountryMarker({
  country,
  onClick,
  isSelected,
}: {
  country: CountryData;
  onClick: () => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const coords = COUNTRY_COORDINATES[country.code];
  if (!coords) return null;

  const position = latLngToVector3(coords.lat, coords.lng, GLOBE_RADIUS + 0.015);
  const color = getThreatColor(country.threat_level);
  const baseSize =
    country.threat_level === 'danger'
      ? 0.07
      : country.threat_level === 'caution'
      ? 0.05
      : 0.035;
  const size = isSelected || hovered ? baseSize * 1.6 : baseSize;

  return (
    <group position={position}>
      {/* Outer glow ring for non-safe */}
      {country.threat_level !== 'safe' && (
        <mesh>
          <ringGeometry args={[baseSize * 2, baseSize * 3.5, 32]} />
          <meshBasicMaterial
            color={color}
            opacity={hovered || isSelected ? 0.35 : 0.15}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Main marker dot */}
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Pulse animation for danger zones */}
      {country.threat_level === 'danger' && (
        <PulsingRing color={color} size={baseSize} />
      )}

      {/* Hover/selected label */}
      {(hovered || isSelected) && (
        <Html
          distanceFactor={6}
          style={{ pointerEvents: 'none' }}
          center
          position={[0, 0.12, 0]}
        >
          <div
            className="px-2.5 py-1.5 rounded-md text-center whitespace-nowrap"
            style={{
              background: 'rgba(10, 14, 26, 0.92)',
              border: `1px solid ${color}50`,
              boxShadow: `0 0 12px ${getThreatGlow(country.threat_level)}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="text-[11px] font-bold text-white leading-tight">
              {country.name}
            </div>
            <div
              className="text-[9px] font-mono uppercase tracking-wider mt-0.5"
              style={{ color }}
            >
              {country.threat_level} · {country.score}/100
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function PulsingRing({ color, size }: { color: string; size: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 2.5) * 0.6;
      ref.current.scale.setScalar(scale);
      (ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.35 - scale * 0.1;
    }
  });
  return (
    <mesh ref={ref}>
      <ringGeometry args={[size * 2.5, size * 4, 32]} />
      <meshBasicMaterial
        color={color}
        opacity={0.3}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function RotatingGlobe({
  countries,
  onCountryClick,
  selectedCountry,
}: SurveillanceGlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useFrame(() => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += 0.0008;
    }
  });

  const handleClick = useCallback(
    (country: CountryData) => {
      setAutoRotate(false);
      onCountryClick(country);
      setTimeout(() => setAutoRotate(true), 12000);
    },
    [onCountryClick]
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <directionalLight position={[-5, -3, -5]} intensity={0.3} color="#4488cc" />

      <group ref={groupRef}>
        <EarthSphere />
        <AtmosphereGlow />

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
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

export function SurveillanceGlobe({
  countries,
  onCountryClick,
  selectedCountry,
}: SurveillanceGlobeProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
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
