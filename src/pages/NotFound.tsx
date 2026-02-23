import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, SkipForward, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import amBlackLogo from "@/assets/amblack.png";
import { supabase } from "@/integrations/supabase/client";

function AnimeModel({ onLoaded }: { onLoaded: () => void }) {
  const { scene, animations } = useGLTF("/models/anime_girl.glb");
  const ref = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, ref);

  useEffect(() => {
    onLoaded();
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
    <primitive ref={ref} object={scene} scale={3.5} position={[0, -2.5, 0]} />
  );
}

useGLTF.preload("/models/anime_girl.glb");

interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  created_at: string;
}

function LostChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [nickname] = useState(() => {
    const adjectives = ["Lost", "Wandering", "Drifting", "Stray", "Roaming", "Ghost", "Phantom", "Shadow"];
    const nouns = ["Traveler", "Soul", "Spirit", "Visitor", "Explorer", "Stranger", "Nomad", "Drifter"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch existing messages
    supabase
      .from("lost_chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data);
      });

    // Subscribe to new messages
    const channel = supabase
      .channel("lost-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lost_chat_messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
  }, [input, nickname]);

  return (
    <div className="w-full h-full bg-transparent flex flex-col">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Lost Souls Chat</span>
        <span className="text-[10px] text-muted-foreground/60">You: {nickname}</span>
      </div>
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1.5">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground/50 text-center py-4">No one here yet... say hi!</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`text-xs ${msg.nickname === nickname ? "text-right" : ""}`}>
              <span className="font-semibold text-muted-foreground/80">{msg.nickname === nickname ? "You" : msg.nickname}: </span>
              <span className="text-foreground/90">{msg.message}</span>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <div className="px-3 py-2 border-t border-white/10 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Say something..."
          className="h-8 text-xs bg-transparent border-white/10"
          maxLength={200}
        />
        <Button variant="ghost" size="icon" onClick={sendMessage} className="h-8 w-8 shrink-0 hover:bg-white/10">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

const NotFound = () => {
  const location = useLocation();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [playing, setPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracks = ["/sounds/404.mp3", "/sounds/404-2.mp3", "/sounds/404-3.mp3"];

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
    <div className="relative h-[100dvh] bg-muted overflow-hidden">
      {/* 3D model fills entire screen */}
      <div className="absolute inset-0">
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
          <Canvas camera={{ position: [0, 0.5, 5], fov: 50 }} onError={() => setError(true)}>
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

      {/* Overlay UI */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">
        {/* Top controls */}
        <div className="flex items-center justify-between pt-4 px-4 sm:px-6 md:px-8 pointer-events-auto max-w-[980px] mx-auto w-full">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={togglePlay} className="rounded-full h-10 w-10 hover:bg-black hover:text-white">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <img src={amBlackLogo} alt="Arcana Mace" className="h-7 w-7" />
            <Button variant="ghost" size="icon" onClick={nextTrack} className="rounded-full h-9 w-9 hover:bg-black hover:text-white">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <a href="/">
            <Button className="bg-black text-white hover:bg-black/80 rounded-md px-5 h-9 text-sm">
              Exit
            </Button>
          </a>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Chat pinned to bottom */}
        <div className="h-[45dvh] sm:h-[40dvh] pointer-events-auto max-w-[980px] mx-auto w-full sm:px-6 md:px-8 sm:pb-4">
          <LostChat />
        </div>
      </div>
    </div>
  );
};

export default NotFound;
