import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

function DragonModel({ onLoaded }: { onLoaded: () => void }) {
  const { scene } = useGLTF("/models/dragon_emblem.glb");
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    onLoaded();
  }, [scene, onLoaded]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.4;
    }
  });

  return (
    <primitive
      ref={ref}
      object={scene}
      scale={2}
      position={[0, -0.5, 0]}
    />
  );
}

useGLTF.preload("/models/dragon_emblem.glb");

const NotFound = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted gap-1">
      <div className="relative w-[260px] h-[260px] sm:w-[340px] sm:h-[340px]">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-4xl font-bold text-muted-foreground">404</p>
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 1, 5], fov: 45 }}
            onCreated={() => {}}
            onError={() => setError(true)}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <Suspense fallback={null}>
              <DragonModel onLoaded={() => setLoading(false)} />
              <Environment preset="studio" />
            </Suspense>
            <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
          </Canvas>
        )}
      </div>
      <a href="/" className="text-primary underline hover:text-primary/90">
        Return to Home
      </a>
    </div>
  );
};

export default NotFound;
