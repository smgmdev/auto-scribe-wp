import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useLoader, ThreeEvent, useThree } from '@react-three/fiber';
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

/** Renders country name labels when camera is zoomed in */
function CountryLabels({ countries, zoomLevel }: { countries: CountryData[]; zoomLevel: number }) {
  if (zoomLevel > 4) return null;
  const maxLabels = zoomLevel < 3.2 ? countries.length : Math.min(20, countries.length);
  const visibleCountries = countries.slice(0, maxLabels);

  return (
    <>
      {visibleCountries.map((country) => {
        const coords = COUNTRY_COORDINATES[country.code];
        if (!coords) return null;
        const pos = latLngToVector3(coords.lat, coords.lng, GLOBE_RADIUS + 0.04);
        return (
          <Html
            key={`label-${country.code}`}
            position={pos}
            distanceFactor={5}
            style={{ pointerEvents: 'none' }}
            center
            occlude={false}
          >
            <span
              style={{
                fontSize: '7px',
                color: 'rgba(255,255,255,0.55)',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                textShadow: '0 0 4px rgba(0,0,0,0.9)',
                whiteSpace: 'nowrap',
              }}
            >
              {country.name}
            </span>
          </Html>
        );
      })}
    </>
  );
}

/** Convert a GeoJSON ring (array of [lng, lat]) to 3D points on the sphere */
function ringToPoints(ring: number[][]): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const [x, y, z] = latLngToVector3(lat, lng, GLOBE_RADIUS + 0.004);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

/** Renders actual country border lines from GeoJSON */
function CountryBorders() {
  const [borderGeometry, setBorderGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    fetch('/data/countries.geo.json')
      .then((r) => r.json())
      .then((geojson: any) => {
        const vertices: number[] = [];

        for (const feature of geojson.features) {
          const geom = feature.geometry;
          if (!geom) continue;

          const processRing = (ring: number[][]) => {
            for (let i = 0; i < ring.length - 1; i++) {
              const [lng1, lat1] = ring[i];
              const [lng2, lat2] = ring[i + 1];
              const [x1, y1, z1] = latLngToVector3(lat1, lng1, GLOBE_RADIUS + 0.004);
              const [x2, y2, z2] = latLngToVector3(lat2, lng2, GLOBE_RADIUS + 0.004);
              vertices.push(x1, y1, z1, x2, y2, z2);
            }
          };

          if (geom.type === 'Polygon') {
            for (const ring of geom.coordinates) {
              processRing(ring);
            }
          } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates) {
              for (const ring of polygon) {
                processRing(ring);
              }
            }
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        setBorderGeometry(geometry);
      })
      .catch((err) => console.error('Failed to load country borders:', err));
  }, []);

  if (!borderGeometry) return null;

  return (
    <lineSegments geometry={borderGeometry}>
      <lineBasicMaterial color="#cccccc" opacity={0.18} transparent />
    </lineSegments>
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
      ? 0.065
      : country.threat_level === 'caution'
      ? 0.045
      : 0.03;
  const size = isSelected || hovered ? baseSize * 1.4 : baseSize;

  return (
    <group position={position}>
      {/* Outer glow ring for non-safe */}
      {country.threat_level !== 'safe' && (
        <mesh>
          <ringGeometry args={[baseSize * 2, baseSize * 3, 32]} />
          <meshBasicMaterial
            color={color}
            opacity={hovered || isSelected ? 0.3 : 0.12}
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

      {/* Tiny hover tooltip */}
      {(hovered || isSelected) && (
        <Html
          distanceFactor={7}
          style={{ pointerEvents: 'none' }}
          center
          position={[0, 0.07, 0]}
        >
          <div
            style={{
              background: 'rgba(8, 12, 22, 0.85)',
              border: `1px solid ${color}30`,
              borderRadius: '3px',
              padding: '1.5px 4px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div style={{ fontSize: '6px', fontWeight: 600, color: '#eee', lineHeight: 1.1 }}>
              {country.name}
            </div>
            <div
              style={{
                fontSize: '5px',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                color,
                lineHeight: 1.2,
              }}
            >
              {country.threat_level} · {country.score}
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

/** Tracks camera distance for zoom-dependent features */
function ZoomTracker({ onZoomChange }: { onZoomChange: (d: number) => void }) {
  const { camera } = useThree();
  useFrame(() => {
    const d = camera.position.length();
    onZoomChange(d);
  });
  return null;
}

function RotatingGlobe({
  countries,
  onCountryClick,
  selectedCountry,
}: SurveillanceGlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(4.5);

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
      <ZoomTracker onZoomChange={setZoomLevel} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <directionalLight position={[-5, -3, -5]} intensity={0.3} color="#4488cc" />

      <group ref={groupRef}>
        <EarthSphere />
        <AtmosphereGlow />
        <CountryBorders />
        <CountryLabels countries={countries} zoomLevel={zoomLevel} />

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
        minDistance={2.8}
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
