import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows, Center } from '@react-three/drei';
import * as THREE from 'three';

interface AvatarModelProps {
  modelPath: string;
  isSpeaking: boolean;
  audioLevel: number;
  color: string;
  isActive: boolean;
}

function AvatarModel({ modelPath, isSpeaking, audioLevel, color, isActive }: AvatarModelProps) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    // Compute bounding box to normalize size
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.2 / maxDim; // normalize to ~2.2 units tall
    clone.scale.multiplyScalar(scale);
    // Center horizontally, sit on ground
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = scaledBox.getCenter(new THREE.Vector3());
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= scaledBox.min.y;
    return clone;
  }, [scene]);

  // Animation state
  const anim = useRef({
    breathPhase: Math.random() * Math.PI * 2,
    swayPhase: Math.random() * Math.PI * 2,
    gesturePhase: Math.random() * Math.PI * 2,
    smoothAudio: 0,
    smoothGesture: 0,
    bobPhase: 0,
    tiltPhase: 0,
  });

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const a = anim.current;

    // Smooth audio
    a.smoothAudio = THREE.MathUtils.lerp(a.smoothAudio, audioLevel, delta * 10);
    a.smoothGesture = THREE.MathUtils.lerp(a.smoothGesture, isSpeaking ? 1 : 0, delta * 4);

    // Update phases
    a.breathPhase += delta * 1.5;
    a.swayPhase += delta * 0.7;
    a.bobPhase += delta * (isSpeaking ? 3.0 + a.smoothAudio * 2 : 0.5);
    a.tiltPhase += delta * (isSpeaking ? 2.0 + a.smoothAudio : 0.3);
    a.gesturePhase += delta * (isSpeaking ? 2.5 : 0.2);

    const g = groupRef.current;

    // === IDLE: gentle breathing (scale Y) + sway ===
    const breathScale = 1 + Math.sin(a.breathPhase) * 0.008;
    const idleSwayZ = Math.sin(a.swayPhase) * 0.015;

    // === SPEAKING: energetic movement ===
    const speakBobY = a.smoothGesture * Math.sin(a.bobPhase) * 0.04 * a.smoothAudio;
    const speakSwayZ = a.smoothGesture * Math.sin(a.gesturePhase * 0.7) * 0.05 * a.smoothAudio;
    const speakLeanX = a.smoothGesture * Math.sin(a.gesturePhase * 0.5) * 0.03 * a.smoothAudio;
    const speakTurnY = a.smoothGesture * Math.sin(a.tiltPhase * 0.4) * 0.06 * a.smoothAudio;

    // Audio-reactive scale pulse
    const audioPulse = isSpeaking ? 1 + a.smoothAudio * 0.03 : 1;

    // Apply transforms
    g.position.y = speakBobY;
    g.rotation.z = idleSwayZ + speakSwayZ;
    g.rotation.x = speakLeanX;
    g.rotation.y = speakTurnY;
    g.scale.set(
      audioPulse,
      breathScale * audioPulse,
      audioPulse
    );

    // Upper body (if we split the model, animate top half more)
    if (upperRef.current) {
      upperRef.current.rotation.x = a.smoothGesture * Math.sin(a.gesturePhase * 1.3) * 0.06 * a.smoothAudio;
      upperRef.current.rotation.z = a.smoothGesture * Math.sin(a.gesturePhase * 0.9) * 0.04 * a.smoothAudio;
    }

    // Head extra movement
    if (headRef.current) {
      headRef.current.rotation.x = a.smoothGesture * Math.sin(a.bobPhase * 1.5) * 0.08 * a.smoothAudio;
      headRef.current.rotation.z = a.smoothGesture * Math.sin(a.tiltPhase * 1.2) * 0.06 * a.smoothAudio;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

function LoadingPlaceholder({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 2;
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 1, 0]}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color={color} wireframe transparent opacity={0.5} />
    </mesh>
  );
}

interface Podcast3DAvatarProps {
  name: string;
  modelPath: string;
  isSpeaking: boolean;
  isActive: boolean;
  audioLevel: number;
  color: string;
}

export function Podcast3DAvatar({ name, modelPath, isSpeaking, isActive, audioLevel, color }: Podcast3DAvatarProps) {
  const glowOpacity = isSpeaking ? 0.4 : 0;

  return (
    <div className={`relative flex flex-col items-center transition-all duration-300 ${isActive ? 'scale-105' : 'scale-95 opacity-60'}`}>
      {/* Glow ring */}
      <div
        className="absolute -inset-4 rounded-full blur-2xl transition-opacity duration-500"
        style={{ background: color, opacity: glowOpacity }}
      />

      {/* 3D Canvas */}
      <div className="relative w-[220px] h-[300px] rounded-2xl overflow-hidden" style={{
        boxShadow: isSpeaking ? `0 0 40px ${color}40, 0 0 80px ${color}20` : 'none',
      }}>
        <Canvas
          camera={{ position: [0, 1.2, 3.5], fov: 30 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <directionalLight position={[-2, 3, -1]} intensity={0.4} color="#a0a0ff" />
          
          {/* Colored accent light */}
          <pointLight
            position={[0, 2, -1.5]}
            intensity={isSpeaking ? 3 : 0.8}
            color={color}
            distance={6}
          />
          <pointLight
            position={[-1.5, 1, 1]}
            intensity={isSpeaking ? 1.5 : 0.3}
            color={color}
            distance={4}
          />

          <Suspense fallback={<LoadingPlaceholder color={color} />}>
            <AvatarModel
              modelPath={modelPath}
              isSpeaking={isSpeaking}
              audioLevel={audioLevel}
              color={color}
              isActive={isActive}
            />
          </Suspense>

          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.35}
            scale={5}
            blur={2.5}
          />

          <Environment preset="city" />
        </Canvas>

        {/* Speaking indicator overlay */}
        {isSpeaking && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${6 + Math.sin(Date.now() / 150 + i) * audioLevel * 12}px`,
                  backgroundColor: color,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name label */}
      <div
        className={`mt-4 px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 ${
          isActive ? 'text-white' : 'text-white/40'
        }`}
        style={{
          backgroundColor: isActive ? color : 'rgba(255,255,255,0.05)',
          boxShadow: isSpeaking ? `0 0 20px ${color}40` : 'none',
        }}
      >
        {name}
      </div>
    </div>
  );
}

// Preload default models
useGLTF.preload('/models/fox_girl.glb');
useGLTF.preload('/models/dude.glb');
