import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei';
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
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  
  // Store animation state
  const animState = useRef({
    headTilt: 0,
    bodyLean: 0,
    gesturePhase: 0,
    breathPhase: 0,
    idleSwayPhase: Math.random() * Math.PI * 2,
    lastAudioLevel: 0,
    smoothAudioLevel: 0,
    gestureIntensity: 0,
    neckBone: null as THREE.Bone | null,
    spineBone: null as THREE.Bone | null,
    leftArmBone: null as THREE.Bone | null,
    rightArmBone: null as THREE.Bone | null,
    headBone: null as THREE.Bone | null,
    bonesFound: false,
  });

  // Find bones in the model
  useEffect(() => {
    const state = animState.current;
    const boneNames = {
      head: ['head', 'Head', 'mixamorigHead', 'Bip001_Head', 'J_Bip_C_Head'],
      neck: ['neck', 'Neck', 'mixamorigNeck', 'Bip001_Neck', 'J_Bip_C_Neck'],
      spine: ['spine', 'Spine', 'mixamorigSpine', 'Bip001_Spine', 'J_Bip_C_Spine', 'spine1', 'Spine1', 'mixamorigSpine1'],
      leftArm: ['leftarm', 'LeftArm', 'mixamorigLeftArm', 'Bip001_L_UpperArm', 'J_Bip_L_UpperArm', 'Left arm', 'Left_arm'],
      rightArm: ['rightarm', 'RightArm', 'mixamorigRightArm', 'Bip001_R_UpperArm', 'J_Bip_R_UpperArm', 'Right arm', 'Right_arm'],
    };

    const findBone = (names: string[]): THREE.Bone | null => {
      let found: THREE.Bone | null = null;
      clonedScene.traverse((child) => {
        if (found) return;
        if (child instanceof THREE.Bone) {
          const childName = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const name of names) {
            if (childName.includes(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
              found = child;
              return;
            }
          }
        }
      });
      return found;
    };

    state.headBone = findBone(boneNames.head);
    state.neckBone = findBone(boneNames.neck);
    state.spineBone = findBone(boneNames.spine);
    state.leftArmBone = findBone(boneNames.leftArm);
    state.rightArmBone = findBone(boneNames.rightArm);
    state.bonesFound = !!(state.headBone || state.spineBone);
  }, [clonedScene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const s = animState.current;
    const t = performance.now() / 1000;

    // Smooth audio level
    s.smoothAudioLevel = THREE.MathUtils.lerp(s.smoothAudioLevel, audioLevel, delta * 8);
    s.gestureIntensity = THREE.MathUtils.lerp(s.gestureIntensity, isSpeaking ? 1 : 0, delta * 3);

    // Phases
    s.breathPhase += delta * 1.2;
    s.idleSwayPhase += delta * 0.5;
    s.gesturePhase += delta * (isSpeaking ? 2.5 + s.smoothAudioLevel * 2 : 0.3);

    const group = groupRef.current;

    // === Whole body: idle breathing + sway ===
    const breathY = Math.sin(s.breathPhase) * 0.005;
    const idleSway = Math.sin(s.idleSwayPhase) * 0.008;
    group.position.y = breathY;
    
    // Body lean when speaking
    const speakLean = isSpeaking ? Math.sin(t * 1.5) * 0.03 * s.smoothAudioLevel : 0;
    group.rotation.z = idleSway + speakLean;
    
    // Subtle forward lean when speaking
    group.rotation.x = isSpeaking ? Math.sin(t * 0.8) * 0.02 * s.gestureIntensity : 0;

    // === Bone-level animations ===
    if (s.headBone) {
      // Head nod/tilt when speaking
      const headNodX = isSpeaking 
        ? Math.sin(s.gesturePhase * 1.3) * 0.08 * s.smoothAudioLevel
        : Math.sin(t * 0.7) * 0.02;
      const headTiltZ = isSpeaking
        ? Math.sin(s.gesturePhase * 0.7) * 0.06 * s.smoothAudioLevel
        : Math.sin(t * 0.4) * 0.015;
      const headTurnY = isSpeaking
        ? Math.sin(s.gesturePhase * 0.5) * 0.05 * s.gestureIntensity
        : 0;

      s.headBone.rotation.x = THREE.MathUtils.lerp(s.headBone.rotation.x, headNodX, delta * 6);
      s.headBone.rotation.z = THREE.MathUtils.lerp(s.headBone.rotation.z, headTiltZ, delta * 5);
      s.headBone.rotation.y = THREE.MathUtils.lerp(s.headBone.rotation.y, headTurnY, delta * 4);
    }

    if (s.neckBone) {
      s.neckBone.rotation.x = isSpeaking
        ? Math.sin(s.gesturePhase * 0.9) * 0.04 * s.smoothAudioLevel
        : Math.sin(t * 0.5) * 0.01;
    }

    if (s.spineBone) {
      // Spine sway for body language
      s.spineBone.rotation.z = isSpeaking
        ? Math.sin(s.gesturePhase * 0.6) * 0.04 * s.gestureIntensity
        : Math.sin(t * 0.3) * 0.008;
      s.spineBone.rotation.y = isSpeaking
        ? Math.sin(s.gesturePhase * 0.4) * 0.03 * s.gestureIntensity
        : 0;
    }

    // Arm gestures when speaking
    if (s.leftArmBone && isSpeaking) {
      s.leftArmBone.rotation.z = THREE.MathUtils.lerp(
        s.leftArmBone.rotation.z,
        Math.sin(s.gesturePhase * 1.2) * 0.15 * s.smoothAudioLevel,
        delta * 4
      );
      s.leftArmBone.rotation.x = THREE.MathUtils.lerp(
        s.leftArmBone.rotation.x,
        Math.sin(s.gesturePhase * 0.8) * 0.1 * s.smoothAudioLevel,
        delta * 3
      );
    }

    if (s.rightArmBone && isSpeaking) {
      s.rightArmBone.rotation.z = THREE.MathUtils.lerp(
        s.rightArmBone.rotation.z,
        Math.sin(s.gesturePhase * 1.1 + 1) * -0.15 * s.smoothAudioLevel,
        delta * 4
      );
      s.rightArmBone.rotation.x = THREE.MathUtils.lerp(
        s.rightArmBone.rotation.x,
        Math.sin(s.gesturePhase * 0.9 + 0.5) * 0.1 * s.smoothAudioLevel,
        delta * 3
      );
    }

    // Scale pulse on strong audio
    const scalePulse = isSpeaking ? 1 + s.smoothAudioLevel * 0.02 : 1;
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, scalePulse, delta * 5));

    // Opacity/visibility for inactive
    if (!isActive) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.opacity !== undefined) {
            mat.transparent = true;
            mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.5, delta * 3);
          }
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={1} />
    </group>
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
      <div className="relative w-[220px] h-[280px] rounded-2xl overflow-hidden" style={{
        boxShadow: isSpeaking ? `0 0 40px ${color}40, 0 0 80px ${color}20` : 'none',
      }}>
        <Canvas
          camera={{ position: [0, 1.2, 2.5], fov: 35 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[3, 5, 3]} intensity={1} castShadow />
          <directionalLight position={[-2, 3, -1]} intensity={0.3} color="#8b9cf6" />
          
          {/* Colored rim light based on speaker */}
          <pointLight
            position={[0, 1.5, -1]}
            intensity={isSpeaking ? 2 : 0.5}
            color={color}
            distance={5}
          />

          <AvatarModel
            modelPath={modelPath}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            color={color}
            isActive={isActive}
          />

          <ContactShadows
            position={[0, -0.5, 0]}
            opacity={0.4}
            scale={4}
            blur={2}
          />

          <Environment preset="city" />
        </Canvas>

        {/* Speaking indicator overlay */}
        {isSpeaking && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
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

// Preload models
useGLTF.preload('/models/fox_girl.glb');
useGLTF.preload('/models/dude.glb');
