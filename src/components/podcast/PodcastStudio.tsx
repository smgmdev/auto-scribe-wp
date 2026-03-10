import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, Loader2, Radio, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PodcastAvatar } from './PodcastAvatar';

interface DialogueLine {
  speaker: 'Nova' | 'Rex';
  text: string;
}

type StudioState = 'idle' | 'generating' | 'playing' | 'paused';

const NOVA_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
const REX_VOICE = 'CwhRBWXzGAHq8TQ4Fs17';  // Roger

const NOVA_COLOR = '#8b5cf6';
const REX_COLOR = '#3b82f6';

export function PodcastStudio() {
  const [topic, setTopic] = useState('');
  const [state, setState] = useState<StudioState>('idle');
  const [dialogue, setDialogue] = useState<DialogueLine[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [audioLevel, setAudioLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [statusText, setStatusText] = useState('Ready to go live');
  const [novaAvatar, setNovaAvatar] = useState<string | null>(null);
  const [rexAvatar, setRexAvatar] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const abortRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTurnIndex]);

  const sourceMapRef = useRef<WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>>(new WeakMap());

  // Audio level analyzer
  const startAnalyser = useCallback((audio: HTMLAudioElement) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // createMediaElementSource can only be called once per element
      let source = sourceMapRef.current.get(audio);
      if (!source) {
        source = ctx.createMediaElementSource(audio);
        sourceMapRef.current.set(audio, source);
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn('Audio analyser not available:', e);
      // Fallback: simulate audio level with a timer
      const tick = () => {
        if (audio && !audio.paused) {
          setAudioLevel(0.3 + Math.random() * 0.5);
          animFrameRef.current = requestAnimationFrame(tick);
        }
      };
      tick();
    }
  }, []);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  }, []);

  // Generate conversation script
  const generateScript = useCallback(async (): Promise<DialogueLine[] | null> => {
    setStatusText('Generating conversation script...');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Session expired');
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-podcast-conversation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ topic: topic.trim(), turns: 6 }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to generate script' }));
      throw new Error(err.error || 'Failed to generate script');
    }

    const data = await response.json();
    return data.dialogue || [];
  }, [topic]);

  // Generate TTS for a single line
  const generateTTS = useCallback(async (text: string, speaker: 'Nova' | 'Rex'): Promise<Blob | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const voiceId = speaker === 'Nova' ? NOVA_VOICE : REX_VOICE;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ text, voiceId }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        toast.error('Voice generation rate limited. Waiting...');
        await new Promise(r => setTimeout(r, 3000));
        return generateTTS(text, speaker); // retry once
      }
      throw new Error(`TTS failed for ${speaker}`);
    }

    return response.blob();
  }, []);

  // Play a single audio blob
  const playAudio = useCallback((blob: Blob) => {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.muted = muted;
      audio.src = url;
      audioRef.current = audio;

      audio.oncanplaythrough = () => {
        startAnalyser(audio);
        audio.play().catch((err) => {
          console.error('Audio play failed:', err);
          stopAnalyser();
          URL.revokeObjectURL(url);
          resolve();
        });
      };

      audio.onended = () => {
        stopAnalyser();
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onerror = (e) => {
        console.error('Audio error:', e);
        stopAnalyser();
        URL.revokeObjectURL(url);
        resolve();
      };
    });
  }, [muted, startAnalyser, stopAnalyser]);

  // Main "Go Live" flow
  const startPodcast = useCallback(async () => {
    if (!topic.trim()) {
      toast.error('Enter a topic first');
      return;
    }

    abortRef.current = false;
    setState('generating');
    setDialogue([]);
    setCurrentTurnIndex(-1);

    // Initialize AudioContext on user gesture to avoid suspension
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    try {
      const script = await generateScript();
      if (!script || script.length === 0) {
        throw new Error('Empty script generated');
      }

      setDialogue(script);
      setState('playing');
      setStatusText('LIVE');

      // Play each turn sequentially
      for (let i = 0; i < script.length; i++) {
        if (abortRef.current) break;

        const turn = script[i];
        setCurrentTurnIndex(i);
        setStatusText(`${turn.speaker} is speaking...`);

        // Generate TTS
        const audioBlob = await generateTTS(turn.text, turn.speaker);
        if (!audioBlob || abortRef.current) break;

        // Play audio
        await playAudio(audioBlob);

        // Brief pause between turns
        if (i < script.length - 1 && !abortRef.current) {
          setAudioLevel(0);
          await new Promise(r => setTimeout(r, 800));
        }
      }

      if (!abortRef.current) {
        setStatusText('Episode complete');
        setState('idle');
        setCurrentTurnIndex(-1);
      }
    } catch (error) {
      console.error('Podcast error:', error);
      toast.error(error instanceof Error ? error.message : 'Podcast failed');
      setState('idle');
      setStatusText('Ready to go live');
    }
  }, [topic, generateScript, generateTTS, playAudio]);

  const stopPodcast = useCallback(() => {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopAnalyser();
    setState('idle');
    setCurrentTurnIndex(-1);
    setStatusText('Stopped');
    setAudioLevel(0);
  }, [stopAnalyser]);

  const skipTurn = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = audioRef.current.duration;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  }, []);

  const currentSpeaker = currentTurnIndex >= 0 ? dialogue[currentTurnIndex]?.speaker : null;
  const isLive = state === 'playing';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Topic Input Bar */}
      <div className="mb-8 flex gap-3">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic... e.g. 'The future of AI regulation in 2026'"
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 text-base"
          disabled={state !== 'idle'}
          onKeyDown={(e) => e.key === 'Enter' && state === 'idle' && startPodcast()}
        />
        {state === 'idle' ? (
          <Button
            onClick={startPodcast}
            disabled={!topic.trim()}
            className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white font-semibold gap-2"
          >
            <Radio className="w-4 h-4" />
            Go Live
          </Button>
        ) : (
          <Button
            onClick={stopPodcast}
            variant="destructive"
            className="h-12 px-6 gap-2"
          >
            <Square className="w-4 h-4" />
            Stop
          </Button>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mb-8 px-4">
        <div className="flex items-center gap-3">
          {isLive && (
            <span className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-red-400 text-sm font-bold uppercase tracking-wider">Live</span>
            </span>
          )}
          {state === 'generating' && (
            <span className="flex items-center gap-2 text-white/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{statusText}</span>
            </span>
          )}
          {state === 'idle' && dialogue.length > 0 && (
            <span className="text-white/40 text-sm">{statusText}</span>
          )}
        </div>

        {isLive && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={skipTurn}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMute}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
        )}
      </div>

      {/* Avatars Stage */}
      <div className="flex items-center justify-center gap-16 md:gap-24 mb-10 min-h-[280px]">
        <PodcastAvatar
          name="Nova"
          isSpeaking={currentSpeaker === 'Nova'}
          isActive={isLive ? currentSpeaker === 'Nova' : state === 'idle'}
          audioLevel={currentSpeaker === 'Nova' ? audioLevel : 0}
          color={NOVA_COLOR}
          gender="female"
          avatarUrl={novaAvatar}
          onAvatarChange={setNovaAvatar}
          editable={state === 'idle'}
        />
        
        {/* VS / Live indicator in center */}
        <div className="flex flex-col items-center gap-2">
          {isLive ? (
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center">
              <Radio className="w-6 h-6 text-red-400 animate-pulse" />
            </div>
          ) : state === 'generating' ? (
            <div className="w-16 h-16 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center">
              <Play className="w-6 h-6 text-white/20" />
            </div>
          )}
          <span className="text-[10px] text-white/30 uppercase tracking-widest">Arcana Pulse</span>
        </div>

        <PodcastAvatar
          name="Rex"
          isSpeaking={currentSpeaker === 'Rex'}
          isActive={isLive ? currentSpeaker === 'Rex' : state === 'idle'}
          audioLevel={currentSpeaker === 'Rex' ? audioLevel : 0}
          color={REX_COLOR}
          gender="male"
          avatarUrl={rexAvatar}
          onAvatarChange={setRexAvatar}
          editable={state === 'idle'}
        />
      </div>

      {/* Transcript */}
      {dialogue.length > 0 && (
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Live Transcript</span>
            <span className="text-xs text-white/30">{dialogue.length} turns</span>
          </div>
          <ScrollArea className="h-[240px] p-5">
            <div className="space-y-4">
              {dialogue.map((line, i) => {
                const isPast = i < currentTurnIndex;
                const isCurrent = i === currentTurnIndex;
                const isFuture = i > currentTurnIndex && state === 'playing';
                const isNova = line.speaker === 'Nova';

                return (
                  <div
                    key={i}
                    className={`flex gap-3 transition-all duration-300 ${
                      isFuture ? 'opacity-20 blur-[1px]' : isPast ? 'opacity-50' : 'opacity-100'
                    }`}
                  >
                    <div
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: isNova ? NOVA_COLOR : REX_COLOR }}
                    >
                      {isNova ? 'N' : 'R'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: isNova ? NOVA_COLOR : REX_COLOR }}
                      >
                        {line.speaker}
                      </span>
                      <p className={`text-sm leading-relaxed mt-0.5 ${
                        isCurrent ? 'text-white' : 'text-white/60'
                      }`}>
                        {line.text}
                      </p>
                    </div>
                    {isCurrent && isSpeakingIndicator()}
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function isSpeakingIndicator() {
  return (
    <div className="shrink-0 flex items-center gap-[2px] pt-2">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-[3px] bg-red-400 rounded-full animate-pulse"
          style={{
            height: `${8 + i * 4}px`,
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </div>
  );
}
