import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, Suspense, useMemo } from "react";
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
  { id: "ai", name: "AI", path: "/models/ai.glb", scale: 3, positionY: -2 },
  { id: "xiexie_shanghai", name: "谢谢上海", path: "/models/xiexie_shanghai.glb", scale: 3, positionY: -2 },
  { id: "fox_girl", name: "Fox Girl", path: "/models/fox_girl.glb", scale: 3, positionY: -2 },
  { id: "dude", name: "Dude", path: "/models/dude.glb", scale: 3, positionY: -2 },
  { id: "spiderman", name: "Spiderman", path: "/models/spiderman.glb", scale: 3, positionY: -2 },
];

// Preload all models
MODELS.forEach((m) => useGLTF.preload(m.path));

function ModelViewer({ modelPath, scale, positionY, onLoaded }: { modelPath: string; scale: number; positionY: number; onLoaded: () => void }) {
  const { scene, animations } = useGLTF(modelPath);
  const ref = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, ref);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    onLoadedRef.current();
    const firstAction = Object.values(actions)[0];
    if (firstAction) {
      firstAction.reset().fadeIn(0.5).play();
    }
    // Only run when the model actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

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

// Spam prevention: blocked words and link patterns
const BLOCKED_PATTERNS = [
  /https?:\/\//i, /www\./i, /\.com\b/i, /\.net\b/i, /\.org\b/i, /\.io\b/i,
  /t\.me\//i, /wa\.me\//i, /discord\.(gg|com)/i, /bit\.ly/i, /tinyurl/i,
  /\b(fuck|shit|ass|bitch|damn|cunt|dick|pussy|nigger|faggot)\b/i,
];

const isSpamMessage = (msg: string): boolean => {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(msg));
};

const RATE_LIMIT_MS = 3000; // 3 seconds between messages

function LostChat({ onSelectModel }: { onSelectModel: (modelId: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(true);
  const [cooldown, setCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const lastSentRef = useRef<number>(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const [modelSelectionActive, setModelSelectionActive] = useState(false);

  // Load and subscribe to global model selection state
  useEffect(() => {
    supabase
      .from("lost_chat_global_state")
      .select("model_selection_active")
      .eq("id", "singleton")
      .single()
      .then(({ data }) => {
        if (data) setModelSelectionActive(data.model_selection_active);
      });

    const channel = supabase
      .channel("model-selection-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lost_chat_global_state" },
        (payload) => {
          const active = (payload.new as any).model_selection_active;
          if (typeof active === "boolean") setModelSelectionActive(active);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || cooldown) return;

    // Rate limiting
    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastSentRef.current)) / 1000);
      setCooldown(true);
      setCooldownSeconds(remaining);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = setInterval(() => {
        setCooldownSeconds((prev) => {
          if (prev <= 1) {
            setCooldown(false);
            if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }

    // Content filtering
    if (isSpamMessage(trimmed)) {
      setInput("");
      return; // Silently reject
    }

    setInput("");
    lastSentRef.current = Date.now();
    setCooldown(true);
    setCooldownSeconds(3);
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          setCooldown(false);
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Handle /rules command
    if (trimmed.toLowerCase() === "/rules") {
      await supabase.from("lost_chat_messages").insert({ nickname, message: "/rules" });
      await supabase.from("lost_chat_messages").insert({ nickname: "Arcana Mace", message: "No link spam. No bots. Watch your language." });
      return;
    }

    // Handle /models command - broadcast publicly & activate selection globally
    if (trimmed.toLowerCase() === "/models") {
      const modelList = MODELS.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
      await supabase.from("lost_chat_messages").insert({ nickname, message: "/models" });
      await supabase.from("lost_chat_messages").insert({ nickname: "Arcana Mace", message: `Model List:\n\n${modelList}\n\nChoose a number to display.` });
      await supabase.from("lost_chat_global_state").update({ model_selection_active: true }).eq("id", "singleton");
      return;
    }

    // Handle number selection only when global selection is active (first responder wins)
    if (modelSelectionActive && /^\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < MODELS.length) {
        const model = MODELS[idx];
        // Atomically deactivate selection and switch model
        const { error } = await supabase
          .from("lost_chat_global_state")
          .update({ model_selection_active: false, active_model_id: model.id, updated_at: new Date().toISOString() })
          .eq("id", "singleton")
          .eq("model_selection_active", true); // Only succeeds if still active (first responder wins)
        
        if (!error) {
          onSelectModel(model.id);
          await supabase.from("lost_chat_messages").insert({ nickname, message: `switched the model to ${model.name} 🎮` });
        } else {
          // Someone else already picked - treat as normal message
          await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
        }
      } else {
        await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
      }
      return;
    }


    await supabase.from("lost_chat_messages").insert({ nickname, message: trimmed });
  }, [input, nickname, onSelectModel, modelSelectionActive, cooldown]);

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
                <pre className="text-[10px] text-[#f2a547]/80 whitespace-pre-wrap font-mono px-2 py-1.5 inline-block text-left">
                  {msg.message}
                </pre>
              ) : msg.nickname === "Arcana Mace" ? (
                <div className="text-left">
                  <span className="font-semibold text-[#f2a547]/80">{msg.nickname}: </span>
                  <pre className="text-[10px] text-[#f2a547]/80 whitespace-pre-wrap font-mono px-2 py-1.5 mt-0.5 text-left">
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
      <div className="px-0 py-2 flex gap-0">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Say something... (available commands: /models for list, /rules)"
          className="h-8 text-xs bg-transparent border-none shadow-none ring-0 focus-visible:ring-0 focus-visible:border-none text-left placeholder:text-left rounded-r-none"
          maxLength={200}
        />
        <Button variant="ghost" size="icon" onClick={sendMessage} disabled={cooldown} className={`h-8 w-8 shrink-0 hover:bg-black rounded-l-none ${cooldown ? 'opacity-40' : ''}`}>
          {cooldown ? (
            <span className="text-[10px] font-bold text-muted-foreground">{cooldownSeconds}</span>
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

function MiniModelPreview({ modelPath, scale, positionY }: { modelPath: string; scale: number; positionY: number }) {
  const { scene, animations } = useGLTF(modelPath);
  const ref = useRef<THREE.Group>(null);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const { actions } = useAnimations(animations, ref);

  useEffect(() => {
    const firstAction = Object.values(actions)[0];
    if (firstAction) firstAction.reset().fadeIn(0.3).play();
  }, [actions]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.5;
  });

  return <primitive ref={ref} object={clonedScene} scale={scale} position={[0, positionY * 0.8, 0]} />;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-black/90 border border-white/10 rounded-xl w-[95vw] max-w-3xl p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <span className="text-sm font-semibold text-white">Select Model</span>
            <p className="text-[10px] text-white/40 mt-0.5">Click to switch the global 3D model</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MODELS.map((model) => {
            const isActive = currentModelId === model.id;
            return (
              <button
                key={model.id}
                onClick={() => { onSelect(model.id); onClose(); }}
                className={`relative group rounded-lg overflow-hidden transition-all duration-200 border ${
                  isActive
                    ? "border-[#f2a547] ring-1 ring-[#f2a547]/40"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <div className="aspect-square bg-black/60">
                  <Canvas camera={{ position: [0, 0.5, 3.5], fov: 50 }}>
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[3, 3, 3]} intensity={0.8} />
                    <Suspense fallback={null}>
                      <MiniModelPreview modelPath={model.path} scale={model.scale} positionY={model.positionY} />
                      <Environment preset="studio" />
                    </Suspense>
                    <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} autoRotate={false} />
                  </Canvas>
                </div>
                <div className={`px-3 py-2.5 text-left ${isActive ? "bg-[#f2a547]" : "bg-white/5 group-hover:bg-white/10"}`}>
                  <span className={`text-xs font-medium ${isActive ? "text-black" : "text-white/90"}`}>{model.name}</span>
                  {isActive && <span className="float-right text-[10px] text-black/60 font-medium">Active</span>}
                </div>
              </button>
            );
          })}
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
  const tracks = ["/sounds/404.mp3", "/sounds/404-2.mp3", "/sounds/404-3.mp3", "/sounds/404-4.mp3", "/sounds/404-5.mp3", "/sounds/404-6.mp3", "/sounds/404-7.mp3", "/sounds/404-8.mp3", "/sounds/404-9.mp3"];

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
