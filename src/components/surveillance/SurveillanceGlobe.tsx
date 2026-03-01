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

interface MissileTrajectory {
  id: string;
  origin_country_code: string | null;
  destination_country_code: string | null;
}

interface GeoFeature {
  properties: { name: string; id?: string };
  geometry: { type: string; coordinates: any };
}

interface SurveillanceGlobeProps {
  countries: CountryData[];
  onCountryClick: (country: CountryData) => void;
  selectedCountry: string | null;
  missileTrajectories?: MissileTrajectory[];
  droneTrajectories?: MissileTrajectory[];
  isSpinning?: boolean;
  onSpinChange?: (spinning: boolean) => void;
}

const GLOBE_RADIUS = 2;

function getThreatColor(level: string, score?: number): string {
  if (score !== undefined) {
    if (score >= 60) return '#ef4444';
    if (score >= 30) return '#f59e0b';
    return '#22c55e';
  }
  switch (level) {
    case 'danger': return '#ef4444';
    case 'caution': return '#f59e0b';
    case 'safe':
    default: return '#22c55e';
  }
}

function getScoreLevel(score: number): 'danger' | 'caution' | 'safe' {
  if (score >= 60) return 'danger';
  if (score >= 30) return 'caution';
  return 'safe';
}

/** Point-in-polygon ray casting algorithm */
function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = [ring[i][0], ring[i][1]];
    const [xj, yj] = [ring[j][0], ring[j][1]];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Check if a lat/lng point is inside a GeoJSON geometry */
function pointInGeometry(lat: number, lng: number, geometry: { type: string; coordinates: any }): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      if (pointInPolygon(lat, lng, polygon[0])) return true;
    }
  }
  return false;
}

/** Convert 3D point on sphere to lat/lng */
function vector3ToLatLng(point: THREE.Vector3, radius: number): { lat: number; lng: number } {
  const normalized = point.clone().normalize();
  const lat = Math.asin(normalized.y) * (180 / Math.PI);
  const lng = Math.atan2(-normalized.z, normalized.x) * (180 / Math.PI);
  return { lat, lng };
}

function EarthSphere({
  onHoverCountry,
  onClickCountry,
  geoFeatures,
}: {
  onHoverCountry: (name: string | null, point: THREE.Vector3 | null) => void;
  onClickCountry: (name: string) => void;
  geoFeatures: GeoFeature[];
}) {
  const texture = useLoader(THREE.TextureLoader, '/textures/earth-blue-marble.jpg');
  const bumpMap = useLoader(THREE.TextureLoader, '/textures/earth-topology.png');

  const findCountry = useCallback(
    (point: THREE.Vector3) => {
      const { lat, lng } = vector3ToLatLng(point, GLOBE_RADIUS);
      for (const feature of geoFeatures) {
        if (feature.geometry && pointInGeometry(lat, lng, feature.geometry)) {
          return feature.properties.name;
        }
      }
      return null;
    },
    [geoFeatures]
  );

  return (
    <mesh
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (e.point && geoFeatures.length > 0) {
          e.stopPropagation();
          // Transform point to local group coords
          const localPoint = e.object.worldToLocal(e.point.clone());
          const name = findCountry(localPoint);
          onHoverCountry(name, name ? e.point : null);
          document.body.style.cursor = name ? 'pointer' : 'default';
        }
      }}
      onPointerOut={() => {
        onHoverCountry(null, null);
        document.body.style.cursor = 'default';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.point && geoFeatures.length > 0) {
          e.stopPropagation();
          const localPoint = e.object.worldToLocal(e.point.clone());
          const name = findCountry(localPoint);
          if (name) onClickCountry(name);
        }
      }}
    >
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

/** Highlights a country's border on hover and shows name at centroid */
function CountryHighlight({ feature }: { feature: GeoFeature }) {
  const { borderGeo, centroid } = useMemo(() => {
    const vertices: number[] = [];
    let centroidLat = 0, centroidLng = 0, totalPoints = 0;

    const processRing = (ring: number[][]) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lng1, lat1] = ring[i];
        const [lng2, lat2] = ring[i + 1];
        centroidLat += lat1; centroidLng += lng1; totalPoints++;
        const [x1, y1, z1] = latLngToVector3(lat1, lng1, GLOBE_RADIUS + 0.006);
        const [x2, y2, z2] = latLngToVector3(lat2, lng2, GLOBE_RADIUS + 0.006);
        vertices.push(x1, y1, z1, x2, y2, z2);
      }
    };

    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) processRing(ring);
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) processRing(ring);
      }
    }

    if (vertices.length === 0) return { borderGeo: null, centroid: null };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    centroidLat /= totalPoints || 1;
    centroidLng /= totalPoints || 1;
    const [px, py, pz] = latLngToVector3(centroidLat, centroidLng, GLOBE_RADIUS + 0.02);
    return { borderGeo: geo, centroid: new THREE.Vector3(px, py, pz) };
  }, [feature]);

  if (!borderGeo || !centroid) return null;
  return (
    <group>
      <lineSegments geometry={borderGeo}>
        <lineBasicMaterial color="#ffffff" linewidth={5} opacity={0.7} transparent />
      </lineSegments>
      <Html position={centroid} distanceFactor={8} style={{ pointerEvents: 'none' }} center>
        <span style={{ fontSize: '6px', fontWeight: 500, color: '#fff', fontFamily: 'monospace', textShadow: '0 1px 3px rgba(0,0,0,0.8)', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {feature.properties.name}
        </span>
      </Html>
    </group>
  );
}
/** Simple merge of multiple BufferGeometries */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const geo of geometries) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    const idx = geo.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push((idx.array as Uint16Array | Uint32Array)[i] + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    }
    offset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

/** Renders actual country border lines from GeoJSON */
function CountryBorders({ geoFeatures }: { geoFeatures: GeoFeature[] }) {
  const borderGeometry = useMemo(() => {
    if (geoFeatures.length === 0) return null;
    const vertices: number[] = [];

    for (const feature of geoFeatures) {
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
        for (const ring of geom.coordinates) processRing(ring);
      } else if (geom.type === 'MultiPolygon') {
        for (const polygon of geom.coordinates) {
          for (const ring of polygon) processRing(ring);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
  }, [geoFeatures]);

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
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const coords = COUNTRY_COORDINATES[country.code];
  const effectiveLevel = getScoreLevel(country.score);
  const sphereSize =
    effectiveLevel === 'danger' ? 0.035
    : effectiveLevel === 'caution' ? 0.025
    : 0.018;

  if (!coords) return null;

  const position = latLngToVector3(coords.lat, coords.lng, GLOBE_RADIUS + 0.012);
  const color = getThreatColor(country.threat_level, country.score);
  const active = hovered || isSelected;

  return (
    <group position={position} ref={groupRef}>
      {/* 3D glowing sphere core */}
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[sphereSize, 16, 16]} />
        <meshPhongMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 1.2 : 0.6}
          transparent
          opacity={active ? 0.95 : 0.8}
          shininess={80}
        />
      </mesh>

      {/* Outer glow shell */}
      <mesh>
        <sphereGeometry args={[sphereSize * 1.6, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.18 : 0.08} />
      </mesh>

      {/* Orbit ring */}
      <OrbitRing color={color} size={sphereSize} speed={effectiveLevel === 'danger' ? 2 : 1} active={active} />

      {/* Danger pulse wave */}
      {effectiveLevel === 'danger' && <PulseWave color={color} size={sphereSize} />}

      {/* Point light for surface glow */}
      <pointLight color={color} intensity={active ? 0.5 : 0.15} distance={sphereSize * 12} />
    </group>
  );
}

function OrbitRing({ color, size, speed, active }: { color: string; size: number; speed: number; active: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime() * speed;
      ref.current.rotation.x = Math.PI / 3;
      ref.current.rotation.z = t;
    }
  });

  return (
    <group ref={ref}>
      <mesh>
        <torusGeometry args={[size * 2.2, size * 0.06, 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.6 : 0.25} />
      </mesh>
    </group>
  );
}

function PulseWave({ color, size }: { color: string; size: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = (clock.getElapsedTime() * 1.2) % 2;
      const scale = 1 + t * 2;
      ref.current.scale.setScalar(scale);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.3 - t * 0.15);
    }
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size * 1.2, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} />
    </mesh>
  );
}

function MissileArc({ originCode, destCode }: { originCode: string; destCode: string }) {
  const missileRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo } = useMemo(() => {
    const oCoords = COUNTRY_COORDINATES[originCode];
    const dCoords = COUNTRY_COORDINATES[destCode];
    if (!oCoords || !dCoords) return { curve: null, tubeGeo: null };

    const start = new THREE.Vector3(...latLngToVector3(oCoords.lat, oCoords.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(dCoords.lat, dCoords.lng, GLOBE_RADIUS + 0.015));
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + 0.8);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.005, 8, false);
    return { curve: c, tubeGeo: tube };
  }, [originCode, destCode]);

  useFrame(({ clock }) => {
    if (missileRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.25) % 1;
      const pos = curve.getPoint(t);
      missileRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.02, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      missileRef.current.quaternion.copy(quat);
    }
  });

  if (!tubeGeo || !curve) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.7} />
      </mesh>
      <mesh ref={missileRef}>
        <coneGeometry args={[0.025, 0.07, 6]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && missileRef.current) light.position.copy(missileRef.current.position);
      }} color="#3b82f6" intensity={0.4} distance={0.5} />
    </group>
  );
}

function DroneArc({ originCode, destCode }: { originCode: string; destCode: string }) {
  const droneRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo } = useMemo(() => {
    const oCoords = COUNTRY_COORDINATES[originCode];
    const dCoords = COUNTRY_COORDINATES[destCode];
    if (!oCoords || !dCoords) return { curve: null, tubeGeo: null };

    const start = new THREE.Vector3(...latLngToVector3(oCoords.lat, oCoords.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(dCoords.lat, dCoords.lng, GLOBE_RADIUS + 0.015));
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + 0.6);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.004, 8, false);
    return { curve: c, tubeGeo: tube };
  }, [originCode, destCode]);

  useFrame(({ clock }) => {
    if (droneRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.18) % 1;
      const pos = curve.getPoint(t);
      droneRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.02, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      droneRef.current.quaternion.copy(quat);
    }
  });

  if (!tubeGeo || !curve) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
      </mesh>
      <mesh ref={droneRef}>
        <coneGeometry args={[0.02, 0.06, 6]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && droneRef.current) light.position.copy(droneRef.current.position);
      }} color="#1e3a5f" intensity={0.3} distance={0.4} />
    </group>
  );
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (d: number) => void }) {
  const { camera } = useThree();
  useFrame(() => onZoomChange(camera.position.length()));
  return null;
}

function RotatingGlobe({
  countries,
  onCountryClick,
  selectedCountry,
  missileTrajectories = [],
  droneTrajectories = [],
  isSpinning = false,
  onSpinChange,
}: SurveillanceGlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [zoomLevel, setZoomLevel] = useState(4.5);
  const [geoFeatures, setGeoFeatures] = useState<GeoFeature[]>([]);
  const [hoveredGeo, setHoveredGeo] = useState<{ name: string; point: THREE.Vector3 } | null>(null);

  const hoveredFeature = useMemo(() => {
    if (!hoveredGeo) return null;
    return geoFeatures.find(f => f.properties.name === hoveredGeo.name) || null;
  }, [hoveredGeo, geoFeatures]);

  // Load GeoJSON once
  useEffect(() => {
    fetch('/data/countries.geo.json')
      .then((r) => r.json())
      .then((geojson: any) => setGeoFeatures(geojson.features || []))
      .catch((err) => console.error('Failed to load GeoJSON:', err));
  }, []);

  useFrame(() => {
    if (groupRef.current && isSpinning) {
      groupRef.current.rotation.y += 0.0008;
    }
  });

  const handleMarkerClick = useCallback(
    (country: CountryData) => {
      onCountryClick(country);
    },
    [onCountryClick]
  );

  const handleGlobeHover = useCallback((name: string | null, point: THREE.Vector3 | null) => {
    if (name && point) {
      setHoveredGeo({ name, point });
    } else {
      setHoveredGeo(null);
    }
  }, []);

  const handleGlobeClick = useCallback(
    (geoName: string) => {
      // Try to find matching country in scan data
      const match = countries.find(
        (c) => c.name.toLowerCase() === geoName.toLowerCase()
      );
      if (match) {
        onCountryClick(match);
      } else {
        // Create a basic entry for countries not in scan data
        onCountryClick({
          code: '',
          name: geoName,
          threat_level: 'safe',
          score: 0,
          summary: 'No threat data available for this country.',
          events: [],
        });
      }
    },
    [countries, onCountryClick]
  );

  return (
    <>
      <ZoomTracker onZoomChange={setZoomLevel} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <directionalLight position={[-5, -3, -5]} intensity={0.3} color="#4488cc" />

      <group ref={groupRef}>
        <EarthSphere
          onHoverCountry={handleGlobeHover}
          onClickCountry={handleGlobeClick}
          geoFeatures={geoFeatures}
        />
        <AtmosphereGlow />
        <CountryBorders geoFeatures={geoFeatures} />

        {countries.map((country) => (
          <CountryMarker
            key={country.code}
            country={country}
            onClick={() => handleMarkerClick(country)}
            isSelected={selectedCountry === country.code}
          />
        ))}

        {hoveredFeature && <CountryHighlight feature={hoveredFeature} />}

        {missileTrajectories.map((t) =>
          t.origin_country_code && t.destination_country_code ? (
            <MissileArc key={t.id} originCode={t.origin_country_code} destCode={t.destination_country_code} />
          ) : null
        )}

        {droneTrajectories.map((t) =>
          t.origin_country_code && t.destination_country_code ? (
            <DroneArc key={t.id} originCode={t.origin_country_code} destCode={t.destination_country_code} />
          ) : null
        )}
      </group>

      <OrbitControls
        enableZoom
        enablePan={false}
        minDistance={2.8}
        maxDistance={8}
        autoRotate={false}
        enableDamping
        dampingFactor={0.08}
        zoomSpeed={0.4}
        rotateSpeed={0.5}
      />
    </>
  );
}

export function SurveillanceGlobe({
  countries,
  onCountryClick,
  selectedCountry,
  missileTrajectories = [],
  droneTrajectories = [],
  isSpinning = false,
  onSpinChange,
}: SurveillanceGlobeProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0.8, 1.8, 3.6], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <RotatingGlobe
          countries={countries}
          onCountryClick={onCountryClick}
          selectedCountry={selectedCountry}
          missileTrajectories={missileTrajectories}
          droneTrajectories={droneTrajectories}
          isSpinning={isSpinning}
          onSpinChange={onSpinChange}
        />
      </Canvas>
    </div>
  );
}
