import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

function AnimeModel({ onLoaded }: { onLoaded: () => void }) {
  const { scene, animations } = useGLTF("/models/anime_girl.glb");
  const ref = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, ref);

  useEffect(() => {
    onLoaded();
    // Play the first animation if available
    const firstAction = Object.values(actions)[0];
    if (firstAction) {
      firstAction.reset().fadeIn(0.5).play();
    }
  }, [scene, onLoaded, actions]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <primitive
      ref={ref}
      object={scene}
      scale={3.5}
      position={[0, -2.5, 0]}
    />
  );
}

useGLTF.preload("/models/anime_girl.glb");

const NotFound = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracks = ["/sounds/404.mp3", "/sounds/404-2.mp3"];

  useEffect(() => {
    const audio = new Audio(tracks[0]);
    audio.loop = true;
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }, [playing]);

  const nextTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextIdx = (trackIndex + 1) % tracks.length;
    audio.src = tracks[nextIdx];
    audio.loop = true;
    if (playing) audio.play();
    setTrackIndex(nextIdx);
  }, [trackIndex, playing, tracks]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted gap-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={togglePlay} className="rounded-full h-12 w-12">
          {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={nextTrack} className="rounded-full h-10 w-10">
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>
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
              <AnimeModel onLoaded={() => setLoading(false)} />
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
