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

export interface SatelliteData {
  satid: number;
  satname: string;
  satlatitude: number;
  satlongitude: number;
  sataltitude: number;
}

export interface EarthquakeData {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  depth: number;
  latitude: number;
  longitude: number;
  tsunami: boolean;
  type: string;
}

export interface PredictedHotspot {
  region: string;
  risk_score: number;
  threat_type: string;
}

interface SurveillanceGlobeProps {
  countries: CountryData[];
  onCountryClick: (country: CountryData) => void;
  selectedCountry: string | null;
  missileTrajectories?: MissileTrajectory[];
  droneTrajectories?: MissileTrajectory[];
  nukeTrajectories?: MissileTrajectory[];
  hbombTrajectories?: MissileTrajectory[];
  tradeTrajectories?: MissileTrajectory[];
  satellites?: SatelliteData[];
  earthquakes?: EarthquakeData[];
  predictedHotspots?: PredictedHotspot[];
  isSpinning?: boolean;
  onSpinChange?: (spinning: boolean) => void;
  resetTrigger?: number;
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
  onHover,
}: {
  country: CountryData;
  onClick: () => void;
  isSelected: boolean;
  onHover?: (name: string | null, point: THREE.Vector3 | null) => void;
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
  const posVec = new THREE.Vector3(...position);

  return (
    <group position={position} ref={groupRef}>
      {/* 3D glowing sphere core */}
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; onHover?.(country.name, posVec); }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; onHover?.(null, null); }}
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
    const dist = start.distanceTo(end);
    const arcHeight = Math.max(0.8, dist * 0.6);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight);

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
    const dist = start.distanceTo(end);
    const arcHeight = Math.max(0.6, dist * 0.5);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight);

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
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.7} />
      </mesh>
      <mesh ref={droneRef}>
        <coneGeometry args={[0.02, 0.06, 6]} />
        <meshBasicMaterial color="#a855f7" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && droneRef.current) light.position.copy(droneRef.current.position);
      }} color="#7c3aed" intensity={0.3} distance={0.4} />
    </group>
  );
}

function NukeArc({ originCode, destCode }: { originCode: string; destCode: string }) {
  const nukeRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo } = useMemo(() => {
    const oCoords = COUNTRY_COORDINATES[originCode];
    const dCoords = COUNTRY_COORDINATES[destCode];
    if (!oCoords || !dCoords) return { curve: null, tubeGeo: null };

    const start = new THREE.Vector3(...latLngToVector3(oCoords.lat, oCoords.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(dCoords.lat, dCoords.lng, GLOBE_RADIUS + 0.015));
    const dist = start.distanceTo(end);
    const arcHeight = Math.max(1.0, dist * 0.7);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.007, 8, false);
    return { curve: c, tubeGeo: tube };
  }, [originCode, destCode]);

  useFrame(({ clock }) => {
    if (nukeRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.12) % 1;
      const pos = curve.getPoint(t);
      nukeRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.02, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      nukeRef.current.quaternion.copy(quat);
    }
  });

  if (!tubeGeo || !curve) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#eab308" transparent opacity={0.8} />
      </mesh>
      <mesh ref={nukeRef}>
        <coneGeometry args={[0.03, 0.08, 6]} />
        <meshBasicMaterial color="#facc15" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && nukeRef.current) light.position.copy(nukeRef.current.position);
      }} color="#eab308" intensity={0.6} distance={0.6} />
    </group>
  );
}

function HBombArc({ originCode, destCode }: { originCode: string; destCode: string }) {
  const hbombRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo } = useMemo(() => {
    const oCoords = COUNTRY_COORDINATES[originCode];
    const dCoords = COUNTRY_COORDINATES[destCode];
    if (!oCoords || !dCoords) return { curve: null, tubeGeo: null };

    const start = new THREE.Vector3(...latLngToVector3(oCoords.lat, oCoords.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(dCoords.lat, dCoords.lng, GLOBE_RADIUS + 0.015));
    const dist = start.distanceTo(end);
    const arcHeight = Math.max(1.2, dist * 0.8);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.009, 8, false);
    return { curve: c, tubeGeo: tube };
  }, [originCode, destCode]);

  useFrame(({ clock }) => {
    if (hbombRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.1) % 1;
      const pos = curve.getPoint(t);
      hbombRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.02, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      hbombRef.current.quaternion.copy(quat);
    }
  });

  if (!tubeGeo || !curve) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#f97316" transparent opacity={0.85} />
      </mesh>
      <mesh ref={hbombRef}>
        <coneGeometry args={[0.035, 0.09, 6]} />
        <meshBasicMaterial color="#fb923c" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && hbombRef.current) light.position.copy(hbombRef.current.position);
      }} color="#f97316" intensity={0.7} distance={0.7} />
    </group>
  );
}

function TradeArc({ originCode, destCode }: { originCode: string; destCode: string }) {
  const tradeRef = useRef<THREE.Mesh>(null);

  const { curve, tubeGeo } = useMemo(() => {
    const oCoords = COUNTRY_COORDINATES[originCode];
    const dCoords = COUNTRY_COORDINATES[destCode];
    if (!oCoords || !dCoords) return { curve: null, tubeGeo: null };

    const start = new THREE.Vector3(...latLngToVector3(oCoords.lat, oCoords.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(dCoords.lat, dCoords.lng, GLOBE_RADIUS + 0.015));
    const dist = start.distanceTo(end);
    const arcHeight = Math.max(0.5, dist * 0.4);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight);

    const c = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tube = new THREE.TubeGeometry(c, 80, 0.005, 8, false);
    return { curve: c, tubeGeo: tube };
  }, [originCode, destCode]);

  useFrame(({ clock }) => {
    if (tradeRef.current && curve) {
      const t = (clock.getElapsedTime() * 0.15) % 1;
      const pos = curve.getPoint(t);
      tradeRef.current.position.copy(pos);
      const next = curve.getPoint(Math.min(t + 0.02, 1));
      const dir = new THREE.Vector3().subVectors(next, pos).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      tradeRef.current.quaternion.copy(quat);
    }
  });

  if (!tubeGeo || !curve) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.6} />
      </mesh>
      <mesh ref={tradeRef}>
        <boxGeometry args={[0.03, 0.03, 0.03]} />
        <meshBasicMaterial color="#22d3ee" />
      </mesh>
      <pointLight ref={(light) => {
        if (light && tradeRef.current) light.position.copy(tradeRef.current.position);
      }} color="#06b6d4" intensity={0.3} distance={0.4} />
    </group>
  );
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (d: number) => void }) {
  const { camera } = useThree();
  useFrame(() => onZoomChange(camera.position.length()));
  return null;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(-1.5, 1.5, -5.5);
const ZOOM_OUT_POS = new THREE.Vector3(0, 0, 12); // max zoom out

function CameraResetter({ trigger }: { trigger: number }) {
  const { camera } = useThree();
  const phase = useRef<'idle' | 'zoom-out' | 'reposition'>('idle');
  const startPos = useRef(new THREE.Vector3());
  const progress = useRef(0);
  const lastTrigger = useRef(trigger);

  useEffect(() => {
    if (trigger > 0 && trigger !== lastTrigger.current) {
      lastTrigger.current = trigger;
      startPos.current.copy(camera.position);
      progress.current = 0;
      phase.current = 'zoom-out';
    }
  }, [trigger, camera]);

  useFrame(() => {
    if (phase.current === 'zoom-out') {
      progress.current = Math.min(progress.current + 0.025, 1);
      const t = 1 - Math.pow(1 - progress.current, 3);
      camera.position.lerpVectors(startPos.current, ZOOM_OUT_POS, t);
      camera.lookAt(0, 0, 0);
      if (progress.current >= 1) {
        startPos.current.copy(camera.position);
        progress.current = 0;
        phase.current = 'reposition';
      }
    } else if (phase.current === 'reposition') {
      progress.current = Math.min(progress.current + 0.02, 1);
      const t = 1 - Math.pow(1 - progress.current, 3);
      camera.position.lerpVectors(startPos.current, DEFAULT_CAMERA_POS, t);
      camera.lookAt(0, 0, 0);
      if (progress.current >= 1) phase.current = 'idle';
    }
  });

  return null;
}

const MAX_VISIBLE_SATELLITES = 80;

function SatelliteInstances({ satellites }: { satellites: SatelliteData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const altitudeScale = 0.003;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const limited = useMemo(() => satellites.slice(0, MAX_VISIBLE_SATELLITES), [satellites]);

  const { positions, tetherGeometry } = useMemo(() => {
    const pos: THREE.Vector3[] = [];
    const tetherPoints: number[] = [];
    for (const sat of limited) {
      const orbitR = Math.min(GLOBE_RADIUS + 0.05 + sat.sataltitude * altitudeScale, GLOBE_RADIUS + 1.2);
      const p = latLngToVector3(sat.satlatitude, sat.satlongitude, orbitR);
      pos.push(new THREE.Vector3(...p));
      const sp = latLngToVector3(sat.satlatitude, sat.satlongitude, GLOBE_RADIUS + 0.01);
      tetherPoints.push(sp[0], sp[1], sp[2], p[0], p[1], p[2]);
    }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tetherPoints, 3));
    return { positions: pos, tetherGeometry: tGeo };
  }, [limited]);

  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < positions.length; i++) {
      dummy.position.copy(positions[i]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, dummy]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId !== undefined) {
      setSelectedIdx(e.instanceId);
      e.stopPropagation();
    }
  }, []);

  const handlePointerOut = useCallback(() => {
    setSelectedIdx(null);
  }, []);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId !== undefined) {
      setSelectedIdx(prev => prev === e.instanceId ? null : e.instanceId!);
      e.stopPropagation();
    }
  }, []);

  if (limited.length === 0) return null;

  const selectedSat = selectedIdx !== null ? limited[selectedIdx] : null;
  const selectedPos = selectedIdx !== null ? positions[selectedIdx] : null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, limited.length]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshBasicMaterial color="#00e5ff" />
      </instancedMesh>
      <lineSegments geometry={tetherGeometry}>
        <lineBasicMaterial color="#00e5ff" transparent opacity={0.1} />
      </lineSegments>
      {selectedSat && selectedPos && (
        <Html position={selectedPos} center style={{ pointerEvents: 'none' }}>
          <div className="bg-black/90 border border-cyan-500/50 rounded px-2 py-1.5 text-[10px] font-mono text-cyan-300 whitespace-nowrap shadow-lg shadow-cyan-500/20 -translate-y-6">
            <div className="font-bold text-cyan-100 text-[11px]">{selectedSat.satname}</div>
            <div className="text-cyan-400/80">NORAD: {selectedSat.satid}</div>
            <div className="text-cyan-400/80">ALT: {selectedSat.sataltitude.toFixed(0)} km</div>
            <div className="text-cyan-400/80">
              {selectedSat.satlatitude.toFixed(2)}°, {selectedSat.satlongitude.toFixed(2)}°
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

const MAX_VISIBLE_EARTHQUAKES = 100;

function getEarthquakeColor(magnitude: number): string {
  if (magnitude >= 7) return '#ff0000';
  if (magnitude >= 5) return '#ff6600';
  if (magnitude >= 4) return '#ffaa00';
  return '#ffdd44';
}

function getEarthquakeSize(magnitude: number): number {
  if (magnitude >= 7) return 0.04;
  if (magnitude >= 5) return 0.03;
  if (magnitude >= 4) return 0.025;
  return 0.018;
}

function EarthquakeInstances({ earthquakes }: { earthquakes: EarthquakeData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const limited = useMemo(() => earthquakes.slice(0, MAX_VISIBLE_EARTHQUAKES), [earthquakes]);

  const positions = useMemo(() => {
    return limited.map((eq) => {
      const p = latLngToVector3(eq.latitude, eq.longitude, GLOBE_RADIUS + 0.015);
      return new THREE.Vector3(...p);
    });
  }, [limited]);

  // Use largest magnitude color for the instanced mesh (individual coloring not supported with single material)
  const dominantColor = useMemo(() => {
    if (limited.length === 0) return '#ffaa00';
    const maxMag = Math.max(...limited.map(e => e.magnitude));
    return getEarthquakeColor(maxMag);
  }, [limited]);

  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < positions.length; i++) {
      dummy.position.copy(positions[i]);
      const s = getEarthquakeSize(limited[i].magnitude) / 0.025; // normalize to base size
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, limited, dummy]);

  // Pulse animation
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
    for (let i = 0; i < positions.length; i++) {
      dummy.position.copy(positions[i]);
      const baseS = getEarthquakeSize(limited[i].magnitude) / 0.025;
      dummy.scale.set(baseS * pulse, baseS * pulse, baseS * pulse);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId !== undefined) {
      setSelectedIdx(e.instanceId);
      e.stopPropagation();
    }
  }, []);

  const handlePointerOut = useCallback(() => {
    setSelectedIdx(null);
  }, []);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId !== undefined) {
      setSelectedIdx(prev => prev === e.instanceId ? null : e.instanceId!);
      e.stopPropagation();
    }
  }, []);

  if (limited.length === 0) return null;

  const selectedEq = selectedIdx !== null ? limited[selectedIdx] : null;
  const selectedPos = selectedIdx !== null ? positions[selectedIdx] : null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, limited.length]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={dominantColor} transparent opacity={0.85} />
      </instancedMesh>
      {selectedEq && selectedPos && (
        <Html position={selectedPos} center style={{ pointerEvents: 'none' }}>
          <div className="bg-black/90 border border-orange-500/50 rounded px-2 py-1.5 text-[10px] font-mono text-orange-300 whitespace-nowrap shadow-lg shadow-orange-500/20 -translate-y-6">
            <div className="font-bold text-orange-100 text-[11px]">M{selectedEq.magnitude.toFixed(1)} Earthquake</div>
            <div className="text-orange-400/80">{selectedEq.place}</div>
            <div className="text-orange-400/80">Depth: {selectedEq.depth.toFixed(1)} km</div>
            <div className="text-orange-400/80">{new Date(selectedEq.time).toLocaleString()}</div>
            {selectedEq.tsunami && <div className="text-red-400 font-bold">⚠ Tsunami warning</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Resolves a hotspot region name to lat/lng coordinates */
function resolveHotspotCoords(region: string): { lat: number; lng: number } | null {
  const regionLower = region.toLowerCase();
  for (const [, v] of Object.entries(COUNTRY_COORDINATES)) {
    if (v.name?.toLowerCase() === regionLower) return { lat: v.lat, lng: v.lng };
  }
  for (const [, v] of Object.entries(COUNTRY_COORDINATES)) {
    if (v.name && (regionLower.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(regionLower))) {
      return { lat: v.lat, lng: v.lng };
    }
  }
  const REGION_ALIASES: Record<string, { lat: number; lng: number }> = {
    'middle east': { lat: 29.0, lng: 47.0 },
    'taiwan strait': { lat: 24.0, lng: 119.5 },
    'south china sea': { lat: 12.0, lng: 114.0 },
    'korean peninsula': { lat: 37.5, lng: 127.0 },
    'east africa': { lat: 1.0, lng: 38.0 },
    'west africa': { lat: 10.0, lng: -3.0 },
    'north africa': { lat: 28.0, lng: 3.0 },
    'central asia': { lat: 41.0, lng: 65.0 },
    'south asia': { lat: 22.0, lng: 78.0 },
    'southeast asia': { lat: 5.0, lng: 110.0 },
    'eastern europe': { lat: 50.0, lng: 30.0 },
    'western europe': { lat: 48.0, lng: 5.0 },
    'horn of africa': { lat: 8.0, lng: 46.0 },
    'baltic states': { lat: 57.0, lng: 24.0 },
    'persian gulf': { lat: 27.0, lng: 51.0 },
    'sahel': { lat: 14.0, lng: 2.0 },
    'caucasus': { lat: 42.0, lng: 44.0 },
    'levant': { lat: 33.0, lng: 36.0 },
    'indo-pacific': { lat: 0.0, lng: 120.0 },
  };
  for (const [key, coords] of Object.entries(REGION_ALIASES)) {
    if (regionLower.includes(key) || key.includes(regionLower)) return coords;
  }
  return null;
}

function getHeatmapColor(riskScore: number): THREE.Color {
  if (riskScore >= 80) return new THREE.Color('#ff1744');
  if (riskScore >= 60) return new THREE.Color('#ff6d00');
  if (riskScore >= 40) return new THREE.Color('#ffab00');
  return new THREE.Color('#ffd600');
}

function HeatmapOverlay({ hotspots }: { hotspots: PredictedHotspot[] }) {
  const groupRef = useRef<THREE.Group>(null);

  const resolvedHotspots = useMemo(() => {
    return hotspots
      .map(h => {
        const coords = resolveHotspotCoords(h.region);
        if (!coords) return null;
        return { ...h, coords };
      })
      .filter(Boolean) as (PredictedHotspot & { coords: { lat: number; lng: number } })[];
  }, [hotspots]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      if (child instanceof THREE.Group) {
        const outerMesh = child.children[1] as THREE.Mesh;
        if (outerMesh?.material) {
          (outerMesh.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * 1.5 + i * 1.2) * 0.04;
        }
        const midMesh = child.children[2] as THREE.Mesh;
        if (midMesh?.material) {
          (midMesh.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 2.0 + i * 0.8) * 0.05;
        }
      }
    });
  });

  if (resolvedHotspots.length === 0) return null;

  return (
    <group ref={groupRef}>
      {resolvedHotspots.map((h, i) => {
        const color = getHeatmapColor(h.risk_score);
        const baseRadius = 0.15 + (h.risk_score / 100) * 0.25;
        const pos = latLngToVector3(h.coords.lat, h.coords.lng, GLOBE_RADIUS + 0.008);
        const normal = new THREE.Vector3(...pos).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          normal
        );

        return (
          <group key={`heatmap-${i}`} position={pos} quaternion={quaternion}>
            <mesh>
              <circleGeometry args={[baseRadius * 0.4, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh>
              <ringGeometry args={[baseRadius * 0.7, baseRadius, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh>
              <ringGeometry args={[baseRadius * 0.35, baseRadius * 0.7, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <pointLight color={color} intensity={0.3 + (h.risk_score / 100) * 0.4} distance={baseRadius * 3} />
          </group>
        );
      })}
    </group>
  );
}

function RotatingGlobe({
  countries,
  onCountryClick,
  selectedCountry,
  missileTrajectories = [],
  droneTrajectories = [],
  nukeTrajectories = [],
  hbombTrajectories = [],
  tradeTrajectories = [],
  satellites = [],
  earthquakes = [],
  predictedHotspots = [],
  isSpinning = false,
  onSpinChange,
  resetTrigger = 0,
}: SurveillanceGlobeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [zoomLevel, setZoomLevel] = useState(4.5);
  const [geoFeatures, setGeoFeatures] = useState<GeoFeature[]>([]);
  const [hoveredGeo, setHoveredGeo] = useState<{ name: string; point: THREE.Vector3 } | null>(null);

  // Reset group rotation when reset is triggered
  useEffect(() => {
    if (resetTrigger > 0 && groupRef.current) {
      groupRef.current.rotation.set(0, 0, 0);
    }
  }, [resetTrigger]);

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
      const geoLower = geoName.toLowerCase();
      // 1. Direct name match
      let match = countries.find((c) => c.name.toLowerCase() === geoLower);
      if (!match) {
        // 2. Find country code from COUNTRY_COORDINATES by geo name, then match by code
        const codeEntry = Object.entries(COUNTRY_COORDINATES).find(
          ([, v]) => v.name?.toLowerCase() === geoLower
        );
        if (codeEntry) {
          match = countries.find((c) => c.code === codeEntry[0]);
        }
      }
      if (!match) {
        // 3. Partial / contains match (e.g. "United States of America" contains "United States")
        match = countries.find(
          (c) => geoLower.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(geoLower)
        );
      }
      if (match) {
        onCountryClick(match);
      } else {
        const codeEntry = Object.entries(COUNTRY_COORDINATES).find(
          ([, v]) => v.name?.toLowerCase() === geoLower
        );
        const code = codeEntry ? codeEntry[0] : '';
        onCountryClick({
          code,
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
      <CameraResetter trigger={resetTrigger} />
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
            onHover={handleGlobeHover}
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

        {nukeTrajectories.map((t) =>
          t.origin_country_code && t.destination_country_code ? (
            <NukeArc key={t.id} originCode={t.origin_country_code} destCode={t.destination_country_code} />
          ) : null
        )}

        {hbombTrajectories.map((t) =>
          t.origin_country_code && t.destination_country_code ? (
            <HBombArc key={t.id} originCode={t.origin_country_code} destCode={t.destination_country_code} />
          ) : null
        )}

        {tradeTrajectories.map((t) =>
          t.origin_country_code && t.destination_country_code ? (
            <TradeArc key={t.id} originCode={t.origin_country_code} destCode={t.destination_country_code} />
          ) : null
        )}

        <SatelliteInstances satellites={satellites} />
        <EarthquakeInstances earthquakes={earthquakes} />
        {predictedHotspots.length > 0 && <HeatmapOverlay hotspots={predictedHotspots} />}
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
  nukeTrajectories = [],
  hbombTrajectories = [],
  tradeTrajectories = [],
  satellites = [],
  earthquakes = [],
  predictedHotspots = [],
  isSpinning = false,
  onSpinChange,
  resetTrigger = 0,
}: SurveillanceGlobeProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [1.2, 1.4, 3.5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <RotatingGlobe
          countries={countries}
          onCountryClick={onCountryClick}
          selectedCountry={selectedCountry}
          missileTrajectories={missileTrajectories}
          droneTrajectories={droneTrajectories}
          nukeTrajectories={nukeTrajectories}
          hbombTrajectories={hbombTrajectories}
          tradeTrajectories={tradeTrajectories}
          satellites={satellites}
          earthquakes={earthquakes}
          predictedHotspots={predictedHotspots}
          isSpinning={isSpinning}
          onSpinChange={onSpinChange}
          resetTrigger={resetTrigger}
        />
      </Canvas>
    </div>
  );
}
