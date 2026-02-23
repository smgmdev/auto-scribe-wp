import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, SkipForward, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import amLogo from "@/assets/amlogo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/appStore";

const MODELS = [
  { id: "anime_girl", name: "Anime Girl", path: "/models/anime_girl.glb", scale: 3.5, positionY: -2.5 },
  { id: "dragon_emblem", name: "Dragon Emblem", path: "/models/dragon_emblem.glb", scale: 3, positionY: -2 },
  { id: "winged_angel", name: "Winged Angel", path: "/models/winged_angel.glb", scale: 3, positionY: -2 },
];

// Preload all models
MODELS.forEach((m) => useGLTF.preload(m.path));

function ModelViewer({ modelPath, scale, positionY, onLoaded }: { modelPath: string; scale: number; positionY: number; onLoaded: () => void }) {
  const { scene, animations } = useGLTF(modelPath);
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
    <primitive ref={ref} object={scene} scale={scale} position={[0, positionY, 0]} />
  );
}

interface ChatMessage {
  id: string;
  nickname: string;
  message: string;
  created_at: string;
  is_system?: boolean;
}

function LostChat({ onSelectModel }: { onSelectModel: (modelId: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(true);
  const [nickname] = useState(() => {
    const adjectives = ["Lost", "Wandering", "Drifting", "Stray", "Roaming", "Ghost", "Phantom", "Shadow"];
    const nouns = ["Traveler", "Soul", "Spirit", "Visitor", "Explorer", "Stranger", "Nomad", "Drifter"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("lost_chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data);
        setChatLoading(false);
      });

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

  const [awaitingModelChoice, setAwaitingModelChoice] = useState(false);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");

    // Handle /models command - broadcast publicly
    if (trimmed.toLowerCase() === "/models") {
      const modelList = MODELS.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
      // Insert the user's /models command publicly
      await supabase.from("lost_chat_messages").insert({ nickname, message: "/models" });
      // Insert Arcana Mace's response publicly
      await supabase.from("lost_chat_messages").insert({ nickname: "Arcana Mace", message: `Model List:\n\n${modelList}\n\nChoose a number to display.` });
      setAwaitingModelChoice(true);
      return;
    }

    // Handle number selection when awaiting model choice (first responder wins, visible to all)
    if (/^\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < MODELS.length) {
        const model = MODELS[idx];
        setAwaitingModelChoice(false);
        onSelectModel(model.id);
        await supabase.from("lost_chat_messages").insert({ nickname, message: `switched the model to ${model.name} 🎮` });
      } else {
        await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
      }
      return;
    }

    // Also still support /play <number> directly
    const playMatch = trimmed.match(/^\/play\s+(\d+)$/i);
    if (playMatch) {
      const idx = parseInt(playMatch[1], 10) - 1;
      if (idx >= 0 && idx < MODELS.length) {
        const model = MODELS[idx];
        onSelectModel(model.id);
        await supabase.from("lost_chat_messages").insert({ nickname, message: `switched the model to ${model.name} 🎮` });
      }
      return;
    }

    setAwaitingModelChoice(false);
    await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
  }, [input, nickname, onSelectModel]);

  return (
    <div className="w-full h-full bg-transparent flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Lost Souls Chat</span>
        <span className="text-[10px] text-muted-foreground/60">You: {nickname}</span>
      </div>
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1.5">
          {chatLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-4">No one here yet... say hi!</p>
          ) : null}
          {messages.map((msg) => (
            <div key={msg.id} className={`text-xs ${msg.is_system ? "" : msg.nickname === "Arcana Mace" ? "" : msg.nickname === nickname ? "text-right" : ""}`}>
              {msg.is_system ? (
                <pre className="text-[10px] text-[#f2a547]/80 whitespace-pre-wrap font-mono bg-white/5 rounded px-2 py-1.5 inline-block text-left">
                  {msg.message}
                </pre>
              ) : msg.nickname === "Arcana Mace" ? (
                <div className="text-left">
                  <span className="font-semibold text-[#f2a547]/80">{msg.nickname}: </span>
                  <pre className="text-[10px] text-[#f2a547]/80 whitespace-pre-wrap font-mono bg-white/5 rounded px-2 py-1.5 mt-0.5 text-left">
                    {msg.message}
                  </pre>
                </div>
              ) : (
                <>
                  <span className="font-semibold text-muted-foreground/80">{msg.nickname === nickname ? "You" : msg.nickname}: </span>
                  <span className="text-foreground/90">{msg.message}</span>
                </>
              )}
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
          placeholder="Say something... (/models for list)"
          className="h-8 text-xs bg-transparent border-white/10 text-left placeholder:text-left"
          maxLength={200}
        />
        <Button variant="ghost" size="icon" onClick={sendMessage} className="h-8 w-8 shrink-0 hover:bg-white/10">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ModelListPopup({ open, onClose, onSelect, currentModelId }: { open: boolean; onClose: () => void; onSelect: (id: string) => void; currentModelId: string }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-black border border-white/10 rounded-lg w-[90vw] max-w-sm p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">Model List</span>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => { onSelect(model.id); onClose(); }}
              className={`w-full text-left px-4 py-3 rounded text-sm transition-all ${
                currentModelId === model.id
                  ? "bg-[#f2a547] text-black font-medium"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {model.name}
              {currentModelId === model.id && <span className="float-right text-xs opacity-70">Active</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const setIs404Page = useAppStore((s) => s.setIs404Page);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [activeModelId, setActiveModelId] = useState("anime_girl");

  const activeModel = MODELS.find((m) => m.id === activeModelId) || MODELS[0];

  useEffect(() => {
    setIs404Page(true);
    return () => setIs404Page(false);
  }, [setIs404Page]);

  // Load global model state and subscribe to realtime changes
  useEffect(() => {
    supabase
      .from("lost_chat_global_state")
      .select("active_model_id")
      .eq("id", "singleton")
      .single()
      .then(({ data }) => {
        if (data?.active_model_id) setActiveModelId(data.active_model_id);
      });

    const channel = supabase
      .channel("global-model")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lost_chat_global_state" },
        (payload) => {
          const newModelId = (payload.new as any).active_model_id;
          if (newModelId) setActiveModelId(newModelId);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Update global model state in DB
  const selectModelGlobally = useCallback(async (modelId: string) => {
    setActiveModelId(modelId);
    await supabase
      .from("lost_chat_global_state")
      .update({ active_model_id: modelId, updated_at: new Date().toISOString() })
      .eq("id", "singleton");
  }, []);

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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modelListOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        navigate("/");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setModelListOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, modelListOpen]);

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
          <Canvas key={activeModelId} camera={{ position: [0, 0.5, 5], fov: 50 }} onError={() => setError(true)}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <Suspense fallback={null}>
              <ModelViewer
                modelPath={activeModel.path}
                scale={activeModel.scale}
                positionY={activeModel.positionY}
                onLoaded={() => setLoading(false)}
              />
              <Environment preset="studio" />
            </Suspense>
            <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
          </Canvas>
        )}
      </div>

      {/* Overlay UI */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">
        {/* Quick Nav Banner */}
        <div className="bg-black text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6 tracking-tight pointer-events-auto">
          <div className="flex items-center gap-2 md:gap-4 whitespace-nowrap overflow-hidden max-w-[980px] mx-auto">
            <span className="font-bold text-[#f2a547] mr-1">QUICK NAV</span>
            <span><span className="font-bold">Model List</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd> / in-chat: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">/models</kbd></span>
            <span><span className="font-bold">Exit</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
          </div>
        </div>

        {/* Playback controls banner */}
        <div className="bg-black text-white pointer-events-auto leading-none border-t border-white/5">
          <div className="flex items-center justify-center px-4 sm:px-6 md:px-8 max-w-[980px] mx-auto w-full h-10">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={togglePlay} className="rounded-none h-10 w-10 text-white hover:bg-white/20 hover:text-white">
                {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              <a href="/" className="flex items-center mx-2">
                <img src={amLogo} alt="Arcana Mace" className="h-9 w-9 hover:opacity-80 transition-opacity" />
              </a>
              <Button variant="ghost" size="icon" onClick={nextTrack} className="rounded-none h-10 w-10 text-white hover:bg-white/20 hover:text-white">
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Chat pinned to bottom */}
        <div className="h-[45dvh] sm:h-[40dvh] pointer-events-auto max-w-[980px] mx-auto w-full sm:px-6 md:px-8 sm:pb-4">
          <LostChat onSelectModel={selectModelGlobally} />
        </div>
      </div>

      {/* Model List Popup */}
      <ModelListPopup
        open={modelListOpen}
        onClose={() => setModelListOpen(false)}
        onSelect={selectModelGlobally}
        currentModelId={activeModelId}
      />
    </div>
  );
};

export default NotFound;
